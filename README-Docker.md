# 🐳 MCP API Client - Docker Deployment Guide

Este guia mostra como executar a API MCP Client usando Docker, tanto para desenvolvimento quanto produção.

## 📋 Pré-requisitos

- **Docker Desktop** instalado e funcionando
- **Docker Compose** (incluído no Docker Desktop)
- **Git** (para clonar o repositório)

## 🚀 Início Rápido

### 1. Desenvolvimento (Recomendado para testes)

```bash
# Windows PowerShell / CMD
docker-compose --profile dev up --build
```

**Acesso:**
- 🌐 API: http://localhost:4000
- 📚 Documentação: http://localhost:4000/docs
- ❤️ Health Check: http://localhost:4000/health

### 2. Produção

```bash
# Windows PowerShell / CMD
docker-compose --profile prod up --build -d
```

**Acesso:**
- 🌐 API: http://localhost:4000
- 📚 Documentação: http://localhost:4000/docs

## 🛠️ Comandos Docker Detalhados

```powershell
# Desenvolvimento (com hot reload)
docker-compose --profile dev up --build

# Desenvolvimento em background
docker-compose --profile dev up --build -d

# Produção
docker-compose --profile prod up --build -d

# Ver logs
docker-compose logs -f
docker-compose logs -f mcp-api-dev    # Logs específicos

# Status dos containers
docker-compose ps

# Parar todos os serviços
docker-compose down

# Limpeza completa
docker-compose down --volumes --remove-orphans
docker system prune -a
```

## 🏗️ Estrutura dos Containers

### Serviços Disponíveis

1. **mcp-api-dev** - Desenvolvimento com hot reload
2. **mcp-api-prod** - Produção otimizada

### Profiles Docker Compose

- `dev` - Desenvolvimento
- `prod` - Produção

## ⚙️ Configuração

### Variáveis de Ambiente

Crie ou edite o arquivo `.env`:

```env
# Servidor
PORT=4000
NODE_ENV=production  # Será sempre 'production' nos containers

# Autenticação
STATIC_TOKEN=seu-token-aqui

# MCP
DEFAULT_TTL_MINUTES=15
SWEEP_INTERVAL_MINUTES=1

# Rate Limiting
RATE_LIMIT_WINDOW_MS=300000
RATE_LIMIT_MAX_REQUESTS=100
STRICT_RATE_LIMIT_MAX_REQUESTS=20
```

### Customização do Docker

#### Dockerfile Multi-stage
- **Base**: Node.js 20 Alpine com dependências essenciais
- **Development**: Inclui devDependencies + hot reload
- **Production**: Otimizado, sem devDependencies, usuário não-root

#### Docker Compose Profiles
- **dev**: Volume mounting para hot reload
- **prod**: Container isolado, reinício automático

## 🔧 Desenvolvimento

### Hot Reload
O modo desenvolvimento monta o código local no container:

```bash
# Qualquer mudança no código reinicia automaticamente
docker-compose --profile dev up
```

### Debugging
Para debug dentro do container:

```bash
# Executar shell no container
docker exec -it mcp-api-dev sh

# Ver logs em tempo real
docker-compose --profile dev logs -f

# Testar conectividade interna
docker exec -it mcp-api-dev curl http://localhost:4000/health
```

## 🚀 Produção

### Características da Build de Produção

- ✅ Multi-stage build otimizada
- ✅ Usuário não-root para segurança
- ✅ Health checks automáticos
- ✅ Reinício automático
- ✅ Otimizações de performance
- ✅ Logs estruturados

### Health Checks

```bash
# API Health
curl http://localhost:4000/health

# Docker health status
docker-compose ps
```

## 📊 Monitoramento

### Logs

```bash
# Todos os logs
docker-compose logs -f

# Logs específicos
docker-compose logs -f mcp-api-dev
docker-compose logs -f mcp-api-prod

# Logs com timestamp
docker-compose logs -f -t
```

### Métricas

```bash
# Uso de recursos
docker stats

# Informações do container
docker inspect mcp-api-prod
```

## 🔒 Segurança

### Container Security
- ✅ Usuário não-root
- ✅ Imagem Alpine (menor superfície de ataque)  
- ✅ Apenas dependências essenciais
- ✅ Variáveis sensíveis via env files

## 🐛 Troubleshooting

### Container não inicia

```bash
# Ver logs de erro
docker-compose logs [service-name]

# Verificar configuração
docker-compose config

# Rebuild limpo
docker-compose down --volumes
docker-compose build --no-cache
docker-compose up
```

### Problemas de NPX

```bash
# Executar no container para debug
docker exec -it mcp-api-dev npx --version
docker exec -it mcp-api-dev which npx
docker exec -it mcp-api-dev env | grep -i node
```

### Problemas de Rede

```bash
# Verificar rede Docker
docker network ls
docker network inspect mcp-api-client_mcp-network
```

### Performance Issues

```bash
# Monitorar recursos
docker stats

# Verificar volumes
docker volume ls
docker volume inspect mcp-api-client_node_modules
```

## 🔄 Updates e Maintenance

### Atualizar Imagem

```bash
# Rebuild com última versão
docker-compose build --no-cache
docker-compose up -d
```

### Backup/Restore

```bash
# Backup configurações
tar -czf mcp-backup.tar.gz .env docker-compose.yml

# Backup dados (se houver volumes persistentes)
docker run --rm -v mcp-api-client_node_modules:/data -v $(pwd):/backup alpine tar czf /backup/volumes.tar.gz /data
```

## 🎯 Próximos Passos

1. **SSL/HTTPS**: Configurar HTTPS diretamente no Express
2. **CI/CD**: Automatizar builds e deploys
3. **Monitoring**: Adicionar Prometheus/Grafana
4. **Logging**: Centralizar logs com ELK stack
5. **Scaling**: Configurar múltiplas instâncias com load balancer externo

---

## 📞 Suporte

- 📚 **Documentação**: http://localhost:4000/docs
- 🔍 **Health Check**: http://localhost:4000/health
- 🐛 **Issues**: Verificar logs com `docker-compose logs -f` 