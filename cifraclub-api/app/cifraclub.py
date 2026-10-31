"""CifraClub Module"""

import json
import re
import threading
import time
import unicodedata
from urllib.parse import quote

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options

CIFRACLUB_URL = "https://www.cifraclub.com.br/"

# Sem isto um site lento prende a consulta por 5 minutos (timeout padrão do
# grid é 300s). Com 30s, se travar ainda pegamos o HTML parcial.
PAGE_LOAD_TIMEOUT = 30

# A busca do site renderiza os resultados via JS depois do DOM pronto: fica
# observando o HTML por até este tempo até aparecer um resultado que combine.
BUSCA_TIMEOUT_SEGUNDOS = 12

# Pontuação mínima para aceitar um resultado de busca como "a nossa música".
# (artista exato vale 3, música exata 4 — ver _pontuar_resultado).
LIMIAR_RESULTADO = 5

# Primeiros segmentos de URL que nunca são música (rodapé, seções, etc).
_NAO_MUSICA = {
    'busca', 'search', 'letra', 'discografia', 'academy', 'explorar',
    'estilos', 'blog', 'playlists', 'editoras', 'albuns', 'assine', 'pub',
    'video', 'videos', 'tab', 'tablaturas', 'ferramentas', 'comunidade',
    'entrar', 'perfil', 'listas', 'config', 'sobre', 'ajuda', 'termos',
    'privacidade', 'politica', 'publicidade', 'cifras', 'musica', 'musicas',
    'cantor', 'cantores', 'instrument', 'instrumento', 'significado',
}

# Um acorde: C, Am, F#, Bb7, Cm(sus4), D9(11), D/F#...
_RE_ACORDE = re.compile(
    r'^[A-G](?:#|b)?'
    r'(?:m|maj|min|dim|aug|sus\d|add\d|M|\d|\+|-|°)*'
    r'(?:/[A-G](?:#|b)?)?'
    r'(?:\(.*\))?$'
)

# Cache em memória: a mesma música consultada de novo responde na hora,
# sem passar pelo navegador. Evita reabrir o Cifra Club a cada toque.
CACHE_TTL_SEGUNDOS = 24 * 3600
_cache = {}
_cache_lock = threading.Lock()

# Orçamento total de uma consulta. O app cliente aborta com 180s; a API
# responde com erro (e cacheia) antes disso, em vez de prender o navegador
# minutos tentando páginas que não existem.
LIMITE_TOTAL_SEGUNDOS = 75

# Caminhos reais resolvidos pela busca ('me-ama' → 'diante-do-trono/me-ama-'):
# guardados para a próxima consulta não refazer a busca.
_busca_cache = {}
_busca_lock = threading.Lock()

# Um único navegador para todas as consultas. Antes cada requisição criava
# um Firefox novo no Selenium Grid (5-15s só para montar a sessão) — era o
# principal motivo da API demorar. A sessão agora é reaproveitada e só é
# recriada quando morre.
_driver = None
_driver_lock = threading.Lock()


def _novo_driver():
    opcoes = Options()
    # Espera só o DOM: a cifra é renderizada server-side, e o evento
    # 'load' fica esperando anúncios/vídeos por minutos.
    opcoes.page_load_strategy = 'eager'
    # Bloqueia imagens e mídia para o Firefox focar no HTML.
    opcoes.set_preference('permissions.default.image', 2)
    opcoes.set_preference('media.autoplay.default', 5)
    return webdriver.Remote("http://selenium:4444/wd/hub", options=opcoes)


def _obter_driver():
    """Driver compartilhado, criado sob demanda."""
    global _driver  # pylint: disable=global-statement
    if _driver is None:
        _driver = _novo_driver()
    return _driver


def _recriar_driver():
    """Derruba a sessão antiga (best effort) para a próxima ser nova."""
    global _driver  # pylint: disable=global-statement
    antigo = _driver
    _driver = None
    if antigo is not None:
        try:
            antigo.quit()
        except Exception:  # pylint: disable=broad-except
            pass


def _aquecer_driver():
    """Cria o navegador já no boot: a primeira consulta do usuário não paga
    o tempo de subir o Firefox. Se falhar (Selenium ainda subindo), tenta
    de novo na primeira requisição."""
    try:
        with _driver_lock:
            _obter_driver()
    except Exception:  # pylint: disable=broad-except
        pass


threading.Thread(target=_aquecer_driver, daemon=True).start()


def _slug(texto: str) -> str:
    """Normaliza para comparar slugs: 'Me Ama' / 'me ama' / 'me-ama-' → 'me-ama'."""
    texto = unicodedata.normalize('NFD', texto or '')
    texto = ''.join(c for c in texto if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', texto.lower()).strip('-')


def _token_acorde(tok: str) -> bool:
    """True se o token é um acorde (para descartar linhas só de acordes)."""
    limpo = tok.strip().strip('()|,')
    return bool(limpo) and bool(_RE_ACORDE.match(limpo))


def _linha_util_de_letra(linha: str) -> bool:
    """Filtra o que não é letra: tablatura, acordes, marcadores de instrumento."""
    if not linha:
        return False
    if linha.startswith('[') and linha.endswith(']'):
        # Mantém marcadores de seção ([Refrão]) e descarta instrumentos.
        return not re.search(
            r'intro|dedilhado|viol|guitarra|solo|interl|tablatura|baixo|bateria',
            linha, re.I,
        )
    if re.match(r'^[A-G][#b]?\|', linha):        # tablatura: E|---9---|
        return False
    if re.match(r'^Parte \d+ de \d+$', linha):    # "Parte 1 de 8"
        return False
    if re.match(r'^[-|=]+$', linha):
        return False
    if all(_token_acorde(t) for t in linha.split()):
        return False
    # Precisa conter letra de verdade (números sozinhos não contam).
    return bool(re.search(r'[^\W\d_]', linha, re.I))


class CifraClub():
    """CifraClub Class"""

    def cifra(self, artist: str, song: str) -> dict:
        """Lê a página HTML e extrai cifra, letra e meta dados da música.

        Se o slug direto não existir (o Cifra Club usa variantes como
        'me-ama-' ou ids numéricos), usa a busca do próprio site para
        descobrir a URL real.
        """
        chave = f"{artist}/{song}".lower()
        with _cache_lock:
            guardado = _cache.get(chave)
        if guardado and time.time() - guardado[0] < CACHE_TTL_SEGUNDOS:
            result = dict(guardado[1])
            result['cache'] = True
            return result

        caminho = f"{artist}/{song}"
        # Prazo compartilhado por toda a consulta (direto + busca + retries).
        prazo = time.time() + LIMITE_TOTAL_SEGUNDOS
        result = {}
        carregou_alguma_vez = False
        content = self._carregar_pagina(CIFRACLUB_URL + caminho, prazo)
        if content:
            carregou_alguma_vez = True
            self._extrair(result, content)

        # Slug direto não achou cifra → procura a URL real na busca do site.
        if 'cifra' not in result and time.time() < prazo:
            real = self._resolver_caminho(artist, song, prazo)
            if real and real.lower() != caminho.lower():
                caminho = real
                content = self._carregar_pagina(CIFRACLUB_URL + caminho, prazo)
                if content:
                    carregou_alguma_vez = True
                    result = {}
                    self._extrair(result, content)

        result.setdefault('cifraclub_url', CIFRACLUB_URL + caminho)
        if 'cifra' not in result:
            result['error'] = "cifra não encontrada (verifique artista/música)"
            # Cacheia o "não encontrado" só quando o site respondeu (senão é
            # queda temporária e vale tentar de novo logo). Sem isso, cada
            # consulta de música inexistente repete a saga de timeouts.
            if carregou_alguma_vez:
                with _cache_lock:
                    _cache[chave] = (time.time(), dict(result))
            return result

        with _cache_lock:
            _cache[chave] = (time.time(), dict(result))
        return result

    def _extrair(self, result: dict, content: str):
        """Preenche `result` a partir do HTML da página da música."""
        soup = BeautifulSoup(content, 'html.parser')
        self.get_details(result, soup)
        self.get_cifra(result, soup)
        self.get_letra(result, soup)

    def _resolver_caminho(self, artist: str, song: str, prazo: float):
        """Descobre a URL real da música via busca do próprio site.

        Resolve casos como 'me-ama' → 'diante-do-trono/me-ama-' (hífen
        sobrando) e títulos com id numérico ('1507538'). Devolve
        'artista/musica' ou None se não achar nada convincente.
        """
        chave = f"{artist}/{song}".lower()
        with _busca_lock:
            guardado = _busca_cache.get(chave)
        if guardado and time.time() - guardado[0] < CACHE_TTL_SEGUNDOS:
            return guardado[1]

        termo = quote(f"{artist} {song}".replace('-', ' ').strip())
        url = CIFRACLUB_URL + '?q=' + termo
        html = self._carregar_com_espera(url, artist, song, prazo)
        if not html:
            return None

        melhor, melhor_pontos = None, 0
        for caminho, pontos in self._candidatos(html, artist, song):
            if pontos > melhor_pontos:
                melhor, melhor_pontos = caminho, pontos
        if melhor and melhor_pontos >= LIMIAR_RESULTADO:
            with _busca_lock:
                _busca_cache[chave] = (time.time(), melhor)
            return melhor
        # Guarda o "não achei" também: música que não existe não deve
        # refazer a busca (75s) a cada consulta do usuário.
        with _busca_lock:
            _busca_cache[chave] = (time.time(), None)
        return None

    def _candidatos(self, html: str, artist: str, song: str):
        """(caminho, pontuação) dos links de música numa página de busca."""
        soup = BeautifulSoup(html, 'html.parser')
        alvo_a, alvo_s = _slug(artist), _slug(song)
        vistos = set()
        for a in soup.find_all('a', href=True):
            caminho = a['href'].split('?')[0].split('#')[0].strip('/')
            partes = caminho.split('/')
            if len(partes) != 2 or caminho in vistos:
                continue
            if partes[0].lower() in _NAO_MUSICA or partes[1].lower() in _NAO_MUSICA:
                continue
            vistos.add(caminho)
            yield caminho, self._pontuar_resultado(partes[0], partes[1], a.get_text(' ', strip=True), alvo_a, alvo_s)

    @staticmethod
    def _pontuar_resultado(href_a: str, href_s: str, texto: str,
                           alvo_a: str, alvo_s: str) -> int:
        """Quanto este resultado parece ser a música pedida."""
        a, s = _slug(href_a), _slug(href_s)
        pontos = 0
        if a == alvo_a:
            pontos += 3
        elif alvo_a and alvo_a in a:
            pontos += 1
        if s == alvo_s:
            pontos += 4
        elif alvo_s and (alvo_s in s or s in alvo_s):
            pontos += 2
        # Título do link ajuda quando a URL usa id numérico ('1507538').
        texto_slug = _slug(texto)
        if texto_slug:
            if alvo_s and alvo_s in texto_slug:
                pontos += 3
            if alvo_a and alvo_a in texto_slug:
                pontos += 1
        return pontos

    def _carregar_com_espera(self, url: str, artist: str, song: str, prazo: float):
        """Abre a página de busca e espera os resultados renderizarem via JS.

        O DOM chega antes do React montar a lista; em vez de dormir um tempo
        fixo, observa o HTML até aparecer um resultado que combine (ou até o
        tempo máximo). Nunca passa do `prazo` da consulta.
        """
        with _driver_lock:
            for tentativa in range(2):
                if time.time() >= prazo:
                    return None
                try:
                    driver = _obter_driver()
                    driver.set_page_load_timeout(
                        max(1, min(PAGE_LOAD_TIMEOUT, prazo - time.time())))
                    try:
                        driver.get(url)
                    except TimeoutException:
                        pass
                    limite = min(time.time() + BUSCA_TIMEOUT_SEGUNDOS, prazo)
                    while True:
                        html = driver.find_element(By.TAG_NAME, 'body').get_attribute('outerHTML')
                        if any(p >= LIMIAR_RESULTADO
                               for _, p in self._candidatos(html, artist, song)):
                            return html
                        if time.time() >= limite:
                            return html
                        time.sleep(0.5)
                except Exception:  # pylint: disable=broad-except
                    if tentativa == 0:
                        _recriar_driver()
                        continue
                    return None
        return None

    def _carregar_pagina(self, url, prazo: float):
        """Abre a URL no navegador compartilhado e devolve o HTML.

        Uma única tentativa extra quando a sessão caiu (Selenium reiniciou,
        navegador morreu de verdade), para não falhar a consulta inteira.
        Respeita o `prazo` da consulta: sem tempo sobrando nem tenta.
        """
        with _driver_lock:
            for tentativa in range(2):
                if time.time() >= prazo:
                    return None
                try:
                    driver = _obter_driver()
                    driver.set_page_load_timeout(
                        max(1, min(PAGE_LOAD_TIMEOUT, prazo - time.time())))
                    try:
                        driver.get(url)
                    except TimeoutException:
                        # Passou dos 30s: o DOM parcial costuma já ter a cifra,
                        # então segue e lê o que chegou em vez de falhar.
                        pass
                    # A página inteira: os seletores do site mudaram (2025+) e a
                    # extração via BeautifulSoup fica livre de classes obfuscadas.
                    return driver.find_element(By.TAG_NAME, 'body').get_attribute('outerHTML')
                except Exception:  # pylint: disable=broad-except
                    if tentativa == 0:
                        _recriar_driver()
                        continue
                    return None
        return None

    def get_details(self, result, soup):
        """Obtém os metadados pelo JSON-LD que o site injeta na página."""
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                dados = json.loads(script.string or '')
            except (TypeError, ValueError):
                continue
            if not isinstance(dados, dict):
                continue
            tipos = dados.get('@type', [])
            if isinstance(tipos, str):
                tipos = [tipos]
            if 'MusicComposition' in tipos and dados.get('name'):
                result['name'] = dados['name']
            if 'MusicRecording' in tipos:
                artista = dados.get('byArtist') or {}
                if isinstance(artista, dict) and artista.get('name'):
                    result['artist'] = artista['name']

        # Melhor esforço: o player só monta o iframe depois, mas o embed
        # às vezes já está no HTML. Sem ele a resposta é só sem youtube_url.
        iframe = soup.find('iframe', src=lambda s: s and 'youtube.com/embed/' in s)
        if iframe:
            cod = iframe['src'].split('/embed/')[1].split('?')[0]
            result['youtube_url'] = f"https://www.youtube.com/watch?v={cod}"

    def get_cifra(self, result, soup):
        """Obtém a cifra da música e converte para lista de linhas.

        No layout atual a cifra fica em `pre[data-chord-content]` dentro de
        um `<article>`; os acordes são <b> com o texto original preservado,
        então `.get_text()` já remonta o alinhamento acordes/letra.
        """
        pre = soup.find('pre', attrs={'data-chord-content': 'true'}) or soup.find('pre')
        if not pre:
            return
        texto = self._limpar_invisiveis(pre.get_text())
        if texto.strip():
            result['cifra'] = texto.split('\n')

    def get_letra(self, result, soup):
        """Extrai a letra da mesma página: a cifra já mistura letra e acordes.

        Removendo as tags <b> (acordes) sobra o texto; as linhas que viram
        vazias ou só de acordes/tablatura são descartadas.
        """
        pre = soup.find('pre', attrs={'data-chord-content': 'true'}) or soup.find('pre')
        if not pre:
            return
        # Cópia: get_cifra precisa das tags <b> intactas.
        clone = BeautifulSoup(str(pre), 'html.parser').find('pre')
        if not clone:
            return
        for b in clone.find_all('b'):
            b.decompose()
        texto = self._limpar_invisiveis(clone.get_text())
        linhas = [l.strip() for l in texto.split('\n')]
        validas = [l for l in linhas if _linha_util_de_letra(l)]
        if validas:
            result['letra'] = validas

    @staticmethod
    def _limpar_invisiveis(texto: str) -> str:
        """Remove zero-width space/BOM que o site injeta em cada linha.

        Invisíveis na tela, mas quebram a detecção de linhas de acordes
        no app.
        """
        return texto.replace('\u200b', '').replace('\u200c', '').replace('\ufeff', '')
