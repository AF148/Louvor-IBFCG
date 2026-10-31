FROM python:3.8-slim-buster

WORKDIR /app

RUN pip install \
  pylint \
  pylint_flask \
  pytest \
  pytest-cov

COPY app/requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY app/ .

# -u = logs sem buffer, para aparecerem em tempo real no `docker logs`.
CMD ["python3", "-u", "api.py"]
