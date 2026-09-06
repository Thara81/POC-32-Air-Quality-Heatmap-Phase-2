FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/etl

COPY etl/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY etl/ .
RUN mkdir -p /app/data

WORKDIR /app/etl
EXPOSE 8010

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]