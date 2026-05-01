FROM nginx:1.27-alpine

COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css books.json /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
COPY images /usr/share/nginx/html/images
COPY bootstrap /usr/share/nginx/html/bootstrap
