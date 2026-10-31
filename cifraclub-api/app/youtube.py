"""YouTube Module"""

import re
import time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

YOUTUBE_URL = "https://www.youtube.com/watch?v="

# 'OLAK5uy_' é playlist de álbum/CD oficial (o que queremos para louvores);
# 'PL' é playlist comum. Misturas automáticas (RD), 'Assistir mais tarde' (LL)
# e vídeos do canal (UU) não têm o prefixo PL e já ficam de fora.
PADRAO_ALBUM = re.compile(r"list=(OLAK5uy_[A-Za-z0-9_-]+)")
PADRAO_PLAYLIST = re.compile(r"list=(PL[A-Za-z0-9_-]{13,})")
PADRAO_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


class YouTube():
    """Descobre a playlist (álbum/CD) a que um vídeo do YouTube pertence.

    A página do vídeo referencia a playlist em várias partes (painel de
    reprodução, seção de álbuns, descrição). Como o YouTube bloqueia
    requisições automatizadas "nulas", a leitura é feita com um navegador
    de verdade, do mesmo jeito que a cifra do Cifra Club.
    """

    def playlist_do_video(self, video_id: str) -> dict:
        """Abre a página do vídeo e devolve a playlistId da playlist que o
        contém, ou None quando não encontra.

        Monta o driver aqui dentro (e não em __init__) para que qualquer
        falha — Selenium fora do ar, sessão não iniciada — caiba no except
        e a API responda 200 com playlistId null, como combinado com o app.
        """
        result = {'video_id': video_id, 'playlistId': None}

        if not PADRAO_VIDEO_ID.match(video_id or ''):
            result['error'] = "video_id inválido"
            return result

        driver = None
        try:
            opcoes = Options()
            # Espera só o DOM: o ytInitialData já vem embutido no HTML inicial.
            opcoes.page_load_strategy = 'eager'
            opcoes.set_preference('permissions.default.image', 2)
            opcoes.set_preference('media.autoplay.default', 5)
            driver = webdriver.Remote("http://selenium:4444/wd/hub", options=opcoes)
            driver.get(YOUTUBE_URL + video_id)
            # Respiro curto: a tela de consentimento/redesign pode reescrever
            # o DOM, e queremos capturar a página depois dos módulos laterais.
            time.sleep(3)
            fonte = driver.page_source
        except:  # pylint: disable=bare-except
            result['error'] = "erro ao carregar a página do YouTube"
            return result
        finally:
            if driver is not None:
                driver.quit()

        # "Unusual traffic" = o YouTube bloqueou o IP por muitas visitas
        # automatizadas. A página de bloqueio não tem os dados do vídeo, então
        # sinalizamos o bloqueio (e não "sem playlist") para o app avisar o
        # usuário com a mensagem certa.
        if 'unusual traffic' in fonte.lower() or '/sorry/' in fonte:
            result['error'] = 'bloqueio'
            return result

        albums = PADRAO_ALBUM.findall(fonte)
        if albums:
            result['playlistId'] = albums[0]
            return result

        for candidato in PADRAO_PLAYLIST.findall(fonte):
            result['playlistId'] = candidato
            break

        return result
