#!/usr/bin/env bash
# ==============================================================================
# 本地私有化 AI 智能笔记系统管理脚本 (macOS)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  source .env
fi

PORT="${PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8008}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

show_help() {
  echo "======================================================================"
  echo -e "${GREEN}🍏 Note macOS 客户端 (Local AI Note & Audio Studio)${NC}"
  echo "======================================================================"
  echo "使用方法: ./run.sh [命令]"
  echo ""
  echo "常用命令:"
  echo -e "  ${BLUE}app${NC}              打开 macOS 原生独立桌面应用 Note.app (推荐)"
  echo -e "  ${BLUE}install-app${NC}      将 Note.app 安装到 macOS「应用程序」(/Applications)"
  echo -e "  ${BLUE}start${NC}            启动后端容器服务"
  echo -e "  ${BLUE}stop${NC}             停止正在运行的笔记系统"
  echo -e "  ${BLUE}restart${NC}          重启笔记系统"
  echo -e "  ${BLUE}status${NC}           查看系统运行状态与本地数据占用"
  echo -e "  ${BLUE}logs${NC}             实时查看运行日志 (Ctrl+C 退出)"
  echo -e "  ${BLUE}backup${NC}           一键将所有笔记、录音与图片打包备份到 backups/ 目录"
  echo -e "  ${BLUE}restore [文件]${NC}   从指定的 tar.gz 备份文件恢复数据"
  echo -e "  ${BLUE}open${NC}             在默认浏览器中打开笔记工作台"
  echo -e "  ${BLUE}help${NC}             显示帮助信息"
  echo "======================================================================"
}

ensure_dirs() {
  mkdir -p "${SCRIPT_DIR}/data/uploads/audio"
  mkdir -p "${SCRIPT_DIR}/data/uploads/images"
  mkdir -p "${SCRIPT_DIR}/backups"
}

cmd="${1:-app}"

case "${cmd}" in
  app)
    ensure_dirs
    echo -e "${BLUE}🚀 正在启动 Note macOS 原生独立桌面应用...${NC}"
    open "${SCRIPT_DIR}/Note.app"
    echo -e "${GREEN}✅ 已唤起 Note 桌面窗口！${NC}"
    ;;

  install-app)
    ensure_dirs
    echo -e "${BLUE}📦 正在将 Note.app 复制到 /Applications...${NC}"
    cp -R "${SCRIPT_DIR}/Note.app" /Applications/Note.app
    echo -e "${GREEN}✅ 安装完成！您现在可以在 Launchpad(启动台) 或 Dock 栏直接点击 Note 图标打开！${NC}"
    ;;

  start)
    ensure_dirs
    echo -e "${BLUE}🚀 正在启动 Note 后端与容器服务...${NC}"
    docker compose up -d
    echo -e "${GREEN}✅ 服务启动成功！${NC}"
    echo -e "🌐 Web 访问地址: ${BLUE}http://localhost:${PORT}${NC}"
    echo -e "📁 本地持久化数据目录: ${YELLOW}${SCRIPT_DIR}/data${NC}"
    open "${SCRIPT_DIR}/Note.app" || open "http://localhost:${PORT}"
    ;;

  stop)
    echo -e "${YELLOW}🛑 正在停止笔记系统...${NC}"
    docker compose down
    echo -e "${GREEN}✅ 系统已停止。${NC}"
    ;;

  restart)
    echo -e "${BLUE}🔄 正在重启笔记系统...${NC}"
    docker compose restart
    echo -e "${GREEN}✅ 重启完成。${NC}"
    ;;

  status)
    echo -e "${BLUE}📊 容器运行状态:${NC}"
    docker compose ps
    echo ""
    echo -e "${BLUE}💾 本地数据占用情况:${NC}"
    if [ -d "${SCRIPT_DIR}/data" ]; then
      du -sh "${SCRIPT_DIR}/data"/* 2>/dev/null || du -sh "${SCRIPT_DIR}/data"
    else
      echo "  (尚未生成本地数据目录)"
    fi
    ;;

  logs)
    docker compose logs -f
    ;;

  backup)
    ensure_dirs
    BACKUP_DIR="${SCRIPT_DIR}/backups"
    TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
    BACKUP_FILE="${BACKUP_DIR}/note_backup_${TIMESTAMP}.tar.gz"

    echo -e "${BLUE}📦 正在打包备份本地所有笔记、录音与图片数据...${NC}"
    tar -czf "${BACKUP_FILE}" -C "${SCRIPT_DIR}" data .env
    BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
    echo -e "${GREEN}✅ 备份成功！${NC}"
    echo -e "   文件位置: ${YELLOW}${BACKUP_FILE}${NC}"
    echo -e "   文件大小: ${GREEN}${BACKUP_SIZE}${NC}"
    ;;

  restore)
    RESTORE_FILE="$2"
    if [ -z "${RESTORE_FILE}" ] || [ ! -f "${RESTORE_FILE}" ]; then
      echo -e "${RED}❌ 错误: 请指定有效的备份文件路径！${NC}"
      echo "示例: ./run.sh restore ./backups/note_backup_20260819_094000.tar.gz"
      exit 1
    fi
    echo -e "${YELLOW}⚠️  警告: 恢复数据将覆盖当前的本地数据！${NC}"
    echo -e "${BLUE}🛑 先停止运行中的服务...${NC}"
    docker compose down
    echo -e "${BLUE}📥 正在解压并恢复数据...${NC}"
    tar -xzf "${RESTORE_FILE}" -C "${SCRIPT_DIR}"
    echo -e "${GREEN}✅ 数据恢复完成！请运行 ./run.sh start 启动服务。${NC}"
    ;;

  open)
    open "http://localhost:${PORT}" || true
    ;;

  help|--help|-h)
    show_help
    ;;

  *)
    echo -e "${RED}❌ 未知命令: ${cmd}${NC}"
    show_help
    exit 1
    ;;
esac
