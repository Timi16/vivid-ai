FROM python:3.12-slim

# The data/file toolkit model-generated programs may use (Pillow alone can
# write image->PDF; reportlab for composed PDFs; numpy/pandas for data work).
RUN pip install --no-cache-dir pillow reportlab numpy pandas

RUN useradd --create-home runner

WORKDIR /srv
COPY server.py .

USER runner

EXPOSE 8080

CMD ["python", "server.py"]
