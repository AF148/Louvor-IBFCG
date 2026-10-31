"""API Module"""

import os
from flask import Flask, json, request
from flask_cors import CORS
from cifraclub import CifraClub
from youtube import YouTube

# CORS liberado para o app Angular (localhost:4200 / ionic serve) chamar a API.
app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    """Home route"""
    return app.response_class(
        response=json.dumps({'api': 'Cifra Club API'}),
        status=200,
        mimetype='application/json'
    )

@app.route('/artists/<artist>/songs/<song>')
def get_cifra(artist, song):
    """Get cifra by artist and song"""
    cifrablub = CifraClub()
    return app.response_class(
        response=json.dumps(cifrablub.cifra(artist, song), ensure_ascii=False),
        status=200,
        mimetype='application/json'
    )

@app.route('/youtube/playlist-do-video')
def get_playlist_do_video():
    """Descobre a playlist/álbum do CD a que um vídeo pertence.

    Sempre responde 200; 'playlistId' vem null quando não acha (o app aí
    importa só o vídeo) ou quando o Selenium falha.
    """
    video_id = request.args.get('video_id', '')
    resultado = YouTube().playlist_do_video(video_id)
    return app.response_class(
        response=json.dumps(resultado, ensure_ascii=False),
        status=200,
        mimetype='application/json'
    )

if __name__ == "__main__":
    # Servidor de produção WSGI (Waitress) — evita o aviso de "development server"
    # do Flask e é seguro para rodar dentro do Docker.
    from waitress import serve

    porta = int(os.getenv('PORT', '3000'))
    print(f'Servindo a API em http://0.0.0.0:{porta} (waitress)')
    serve(app, host='0.0.0.0', port=porta)
