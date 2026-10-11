FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html styles.css app.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
