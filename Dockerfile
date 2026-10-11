FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html styles.css app.js /usr/share/nginx/html/
COPY img /usr/share/nginx/html/img
COPY sfx /usr/share/nginx/html/sfx

# Cache-bust css/js (nginx serves them as immutable for 30 days)
RUN sed -i "s/?v=dev/?v=$(date +%s)/g" /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
