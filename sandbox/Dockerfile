FROM python:3.12-slim

RUN useradd --create-home runner

WORKDIR /srv
COPY server.py .

USER runner

EXPOSE 8080

CMD ["python", "server.py"]
