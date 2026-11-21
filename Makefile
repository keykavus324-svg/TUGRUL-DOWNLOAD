.PHONY: setup dev build start test docker clean

setup:            ## bağımlılıkları kur
	npm run setup

dev:              ## geliştirme sunucusu (API + derlenmiş arayüz)
	npm run dev

build:            ## üretim arayüzü derle
	npm run build

start:            ## üretim modu (8000 portu)
	npm run start

test:             ## arka uç testleri
	npm test

docker:           ## imaj oluştur
	npm run docker:build

clean:            ## geçici dosyaları sil
	rm -rf frontend/dist data/cache downloads/*.part backend/**/__pycache__
