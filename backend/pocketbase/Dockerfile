FROM alpine:3.20

ARG PB_VERSION=v0.40.1
RUN apk add --no-cache curl unzip ca-certificates

# Install PocketBase binary into /pocketbase
RUN mkdir -p /pocketbase \
  && ARCH="$(uname -m)" \
  && case "$ARCH" in x86_64) PB_ARCH=amd64;; aarch64|arm64) PB_ARCH=arm64;; *) echo "unsupported arch $ARCH"; exit 1;; esac \
  && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -o /tmp/pb.zip \
  && unzip -o /tmp/pb.zip -d /pocketbase \
  && rm -f /tmp/pb.zip \
  && chmod +x /pocketbase/pocketbase

# migrations and pb_hooks are baked into the image so schema + JS hooks ship with the app
COPY migrations/ /pocketbase/pb_migrations/
COPY hooks/ /pocketbase/pb_hooks/

EXPOSE 8080
VOLUME ["/pocketbase/pb_data"]

CMD ["/pocketbase/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pocketbase/pb_data"]