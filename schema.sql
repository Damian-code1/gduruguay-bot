-- =====================================================================
-- gduruguay-bot v2 — Esquema de base de datos (MySQL / Aiven)
-- Ejecutar completo en una base de datos nueva y vacía.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Roles de staff (quién puede usar comandos de moderación además de Admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_roles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  role_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_role (guild_id, role_id),
  INDEX idx_staff_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Canales donde se permite usar comandos del bot (si está vacío = todos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS command_channels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cmd_channel (guild_id, channel_id),
  INDEX idx_cmdchannel_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Rol de mute configurado por servidor
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mute_roles (
  guild_id VARCHAR(20) PRIMARY KEY,
  role_id VARCHAR(20) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Mutes activos (para poder restaurar los timers si el bot se reinicia)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_mutes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  role_id VARCHAR(20) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_active_mute (guild_id, user_id),
  INDEX idx_mute_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Historial de acciones de moderación (ban, kick, mute, warn, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderation_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(30) NOT NULL,               -- ban, unban, kick, mute, unmute, warn, clearwarns, clear
  guild_id VARCHAR(20) NOT NULL,
  target_id VARCHAR(20) NOT NULL,
  target_tag VARCHAR(100),
  moderator_id VARCHAR(20) NOT NULL,
  moderator_tag VARCHAR(100),
  razon TEXT,
  duracion_ms BIGINT NULL,
  duracion_texto VARCHAR(50) NULL,
  expires_at DATETIME NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_modlog_guild_target (guild_id, target_id),
  INDEX idx_modlog_tipo (tipo),
  INDEX idx_modlog_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Advertencias (warns)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warnings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  target_id VARCHAR(20) NOT NULL,
  target_tag VARCHAR(100),
  moderator_id VARCHAR(20) NOT NULL,
  moderator_tag VARCHAR(100),
  razon TEXT NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_warn_guild_target (guild_id, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Autorole (rol asignado automáticamente a nuevos miembros)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autorole (
  guild_id VARCHAR(20) PRIMARY KEY,
  role_id VARCHAR(20) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Estado AFK de usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afk_status (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  reason VARCHAR(200) DEFAULT 'AFK',
  since TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
