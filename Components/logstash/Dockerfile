FROM docker.elastic.co/logstash/logstash-oss:6.5.2

COPY ./logstash/config/logstash.yml /usr/share/logstash/config/logstash.yml
COPY ./logstash/pipeline /usr/share/logstash/pipeline
COPY ./depends /depends
