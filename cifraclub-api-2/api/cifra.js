const axios = require('axios');
const cheerio = require('cheerio');

const CIFRACLUB_URL = "https://www.cifraclub.com.br/";
const CIFRALIZE_URL = "https://cifralize.com.br/";

class CifraClub {
    constructor() {
        this.session = axios.create({
            // O serviço busca páginas públicas diretamente; não use proxies locais
            // configurados pelo ambiente (como 127.0.0.1:9, que causa ECONNREFUSED).
            proxy: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10 segundos
        });
    }

    async cifra(artist, song) {
        const result = {
            artist: artist,
            name: song,
            cifraclub_url: `${CIFRACLUB_URL}${artist}/${song}`,
            error: null
        };

        try {
            let response = await this.buscarPagina(result.cifraclub_url);

            // Alguns títulos têm um slug oficial diferente do slug previsível,
            // como "me-ama-". Em caso de 404, resolvemos o link pelo catálogo do artista.
            if (response.status === 404) {
                const urlEncontrada = await this.buscarUrlNoCatalogo(artist, song);
                if (urlEncontrada) {
                    result.cifraclub_url = urlEncontrada;
                    response = await this.buscarPagina(urlEncontrada);
                }
            }

            if (response.status >= 400) {
                result.error = response.status === 404
                    ? 'Música não encontrada no Cifra Club. Confira o nome do artista e o título como aparecem no site.'
                    : `O Cifra Club respondeu com o erro ${response.status}.`;
                return result;
            }
            
            // Se a URL final for diferente da requisitada, atualizar
            if (response.request.res.responseUrl !== result.cifraclub_url) {
                result.cifraclub_url = response.request.res.responseUrl;
            }
            
            const $ = cheerio.load(response.data);

            this.getDetails(result, $);
            this.getCifra(result, $);
        } catch (e) {
            result.error = e.message;
        }

        return result;
    }

    async buscarPagina(url) {
        return this.session.get(url, {
            maxRedirects: 5,
            // Receber 404 como resposta permite tentar resolver o slug no catálogo.
            validateStatus: status => status >= 200 && status < 500
        });
    }

    async buscarUrlNoCatalogo(artist, song) {
        try {
            const urlArtista = `${CIFRACLUB_URL}${artist}/`;
            const response = await this.buscarPagina(urlArtista);
            if (response.status >= 400) return null;

            const $ = cheerio.load(response.data);
            const slugAlvo = normalizarSlug(song);
            let urlEncontrada = null;

            $('a[href]').each((_, link) => {
                if (urlEncontrada) return;
                const href = $(link).attr('href');
                if (!href) return;

                let url;
                try {
                    url = new URL(href, CIFRACLUB_URL);
                } catch {
                    return;
                }
                if (!url.hostname.endsWith('cifraclub.com.br')) return;

                const partes = url.pathname.split('/').filter(Boolean);
                if (partes.length !== 2 || normalizarSlug(partes[0]) !== normalizarSlug(artist)) return;

                const slugLink = normalizarSlug(partes[1]);
                const textoLink = normalizarSlug($(link).text().replace(/^\d+\s*/, ''));
                if (slugLink === slugAlvo || textoLink === slugAlvo) {
                    urlEncontrada = `${CIFRACLUB_URL}${partes[0]}/${partes[1]}`;
                }
            });

            return urlEncontrada;
        } catch {
            // Se o catálogo estiver indisponível, a API preserva o erro original da música.
            return null;
        }
    }

    async buscarNoCifralize(artist, song) {
        try {
            const consulta = encodeURIComponent(`${song} ${artist}`);
            const respostaBusca = await this.session.get(`${CIFRALIZE_URL}search?q=${consulta}&format=json`);
            const musicas = respostaBusca.data?.songs || [];
            const alvoMusica = normalizarSlug(song);
            const alvoArtista = normalizarSlug(artist);
            const encontrada = musicas.find(musica =>
                normalizarSlug(musica.title) === alvoMusica &&
                normalizarSlug(musica.artist_name) === alvoArtista
            ) || musicas.find(musica => normalizarSlug(musica.title) === alvoMusica);

            if (!encontrada?.embed_url) return null;

            const urlEmbed = new URL(encontrada.embed_url, CIFRALIZE_URL).toString();
            const respostaEmbed = await this.session.get(urlEmbed);
            const $ = cheerio.load(respostaEmbed.data);
            const bloco = $('.chords-display').first();
            if (!bloco.length) return null;

            const cifraTexto = bloco.text().replace(/\u200B/g, '').trim();
            if (!cifraTexto) return null;

            const linhas = cifraTexto.split(/\r?\n/).filter(linha => linha.trim());
            // Remove os acordes do clone para a letra ficar limpa e manter as estrofes.
            const blocoLetra = bloco.clone();
            blocoLetra.find('.chord').remove();
            const letra = organizarLetra(blocoLetra.text(), bloco.text());
            const urlMusica = new URL(encontrada.url || encontrada.embed_url, CIFRALIZE_URL).toString();
            return {
                name: encontrada.title,
                artist: encontrada.artist_name,
                cifraclub_url: urlMusica,
                cifra: linhas,
                letra,
                source: 'Cifralize'
            };
        } catch {
            // Uma falha no serviço alternativo não deve interromper a busca principal.
            return null;
        }
    }

    getDetails(result, $) {
        try {
            // O Cifra Club atual mantém o título num h1; a classe antiga .t1 mudou.
            const titleElem = $('h1').first().text().trim();
            if (titleElem) result.name = titleElem;

            const artistElem = $('h2.t3').text().trim();
            if (artistElem) result.artist = artistElem;

            const playerPlaceholder = $('div.player-placeholder img').attr('src');
            if (playerPlaceholder && playerPlaceholder.includes('/vi/')) {
                const cod = playerPlaceholder.split('/vi/')[1].split('/')[0];
                result.youtube_url = `https://www.youtube.com/watch?v=${cod}`;
            }
        } catch (e) {
            if (!result.error) result.error = `Erro ao obter detalhes: ${e.message}`;
        }
    }

    getCifra(result, $) {
        try {
            // A marcação atual usa o atributo estável data-chord-container/data-chord-content.
            let cifraContent = $('article[data-chord-container]');
            if (!cifraContent.length) cifraContent = $('pre[data-chord-content]');
            // Mantém compatibilidade com páginas que ainda usam os seletores antigos.
            if (!cifraContent.length) cifraContent = $('div.cifra_cnt');
            if (!cifraContent.length) cifraContent = $('pre.js-tab-content');

            if (cifraContent.length) {
                let preTag = cifraContent.find('pre');
                if (!preTag.length) preTag = cifraContent;

                // O site inclui espaços Unicode invisíveis no começo das linhas.
                const cifraText = preTag.text().replace(/\u200B/g, '').trim();
                if (cifraText) {
                    const linhasOriginais = cifraText.split(/\r?\n/);
                    const linhas = linhasOriginais.filter(line => line.trim());
                    // A página do Cifra Club mistura letra, acordes e tablaturas no mesmo bloco.
                    result.cifra = linhas;
                    const blocoLetra = preTag.clone();
                    blocoLetra.find('[data-chord-name], [data-chord]').remove();
                    result.letra = organizarLetra(blocoLetra.text(), cifraText);
                    if (!result.letra) delete result.letra;
                } else {
                    result.error = "A página foi encontrada, mas não contém conteúdo para importar.";
                }
            } else {
                result.error = "A página foi encontrada, mas não contém conteúdo para importar.";
            }
        } catch (e) {
            if (!result.error) result.error = `Erro ao obter cifra: ${e.message}`;
        }
    }
}

// Remove da letra as linhas que contêm apenas acordes ou tablatura.
function ehLinhaDeAcordesOuTab(linha) {
    const texto = linha.trim();
    if (!texto) return false;
    if (/^[eBGDAE]\|/.test(texto) || /^(?:Parte\s+\d+\s+de\s+\d+|[-|0-9/\\hpb~()]+)$/.test(texto)) return true;

    const tokens = texto.split(/\s+/);
    const acorde = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\([^)]*\))?(?:\/[A-G](?:#|b)?)?$/;
    return tokens.length > 0 && tokens.every(token => acorde.test(token));
}

// Limpa espaços vazios e preserva uma linha em branco entre as estrofes.
function organizarLetra(texto, textoComAcordes = texto) {
    const linhasOriginais = String(texto || '')
        .replace(/\u200B/g, '')
        .split(/\r?\n/);
    const linhasFonte = String(textoComAcordes || '')
        .replace(/\u200B/g, '')
        .split(/\r?\n/);
    const linhas = linhasOriginais.map((linha, indice) => ({
        texto: linha.replace(/\(\s*\)/g, '').trim(),
        tinhaAcorde: Boolean(linhasFonte[indice]?.trim()),
    })).filter(({ texto, tinhaAcorde }) => {
        // Linhas que ficaram vazias porque só continham acordes não separam os versos.
        if (!texto) return !tinhaAcorde;
        return !ehLinhaDeAcordesOuTab(texto);
    }).map(item => item.texto);

    // Colapsa linhas vazias repetidas e remove separadores no começo e no fim.
    while (linhas[0] === '') linhas.shift();
    while (linhas[linhas.length - 1] === '') linhas.pop();
    for (let indice = linhas.length - 1; indice > 0; indice--) {
        if (linhas[indice] === '' && linhas[indice - 1] === '') linhas.splice(indice, 1);
    }
    return linhas.join('\n').trim();
}

const cifraClub = new CifraClub();

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    
    // Remover acentos
    const withoutAccents = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    return withoutAccents
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') // Remove hífens no início/fim
        .trim();
}

// Compara slugs ignorando hífens extras nas pontas (ex.: "me-ama" e "me-ama-").
function normalizarSlug(input) {
    return String(input || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Função exportada para Vercel
module.exports = async (req, res) => {
    // Suporte a CORS básico
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Rate limiting básico (não usa express-rate-limit, pois é serverless)
    // Para um controle mais robusto, use um serviço externo ou banco de dados
    const { artist, song } = req.query;

    if (!artist || !song) {
        return res.status(400).json({
            error: "Os parâmetros 'artist' e 'song' são obrigatórios."
        });
    }

    const sanitizedArtist = sanitizeInput(artist);
    const sanitizedSong = sanitizeInput(song);

    if (!sanitizedArtist || !sanitizedSong) {
        return res.status(400).json({
            error: "Parâmetros inválidos após sanitização."
        });
    }

    try {
        let result = await cifraClub.cifra(sanitizedArtist, sanitizedSong);

        // Cada campo é independente: busca na alternativa apenas o que está faltando.
        const temAcordes = result.cifra?.some(linha => ehLinhaDeAcordesOuTab(linha));
        const faltaCifra = !result.cifra?.length || !temAcordes;
        const faltaLetra = !result.letra?.trim();
        if (faltaCifra || faltaLetra) {
            const alternativa = await cifraClub.buscarNoCifralize(sanitizedArtist, sanitizedSong);
            if (alternativa) {
                // Preserva os dados já encontrados no Cifra Club e completa só os ausentes.
                if (faltaCifra && alternativa.cifra?.length) result.cifra = alternativa.cifra;
                if (faltaLetra && alternativa.letra?.trim()) result.letra = alternativa.letra;

                // Mantém como origem a fonte da cifra quando ela veio do Cifralize.
                if (faltaCifra && alternativa.cifra?.length) {
                    result.cifraclub_url = alternativa.cifraclub_url;
                    result.source = alternativa.source;
                    result.name = alternativa.name || result.name;
                    result.artist = alternativa.artist || result.artist;
                } else if (!result.cifraclub_url && alternativa.cifraclub_url) {
                    result.cifraclub_url = alternativa.cifraclub_url;
                    result.source = alternativa.source;
                }

                // Se a alternativa conseguiu fornecer cifra, um erro da primeira fonte já não procede.
                if (result.cifra?.length && result.cifra.some(linha => ehLinhaDeAcordesOuTab(linha))) {
                    delete result.error;
                }
            }
        }
        
        if (!result.error) {
            // Remover propriedades null ou undefined
            Object.keys(result).forEach(key => 
                (result[key] === null || result[key] === undefined) && delete result[key]
            );
            
            // Adicionar metadados úteis
            result.timestamp = new Date().toISOString();
            result.source = result.source || "Cifra Club (2)";
        }
        
        res.status(200).json(result);
    } catch (e) {
        res.status(500).json({
            error: `Erro interno no servidor: ${e.message}`
        });
    }
};
