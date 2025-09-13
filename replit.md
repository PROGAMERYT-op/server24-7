# Minecraft Bot Dashboard

## Overview

This project is a fully functional Minecraft bot application that combines automated gameplay with web-based monitoring. The bot connects to Minecraft servers using the Mineflayer library and provides intelligent patrol functionality within a 5-block radius, while a web dashboard offers real-time monitoring and control capabilities. The system includes coordinate detection from chat messages and dynamic center point updating. The system is designed for server administration, automated tasks, and gameplay assistance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Components

**Bot Engine**: Built on the Mineflayer library, this handles all Minecraft server interactions including connection management, movement, and game state tracking. The bot maintains persistent state information including position, health, food levels, and patrol status.

**Web Dashboard**: Express.js server providing a real-time web interface for monitoring bot status and activities. Uses CORS for cross-origin requests and serves static HTML files for the user interface.

**Configuration Management**: JSON-based configuration system storing server connection details, bot credentials, patrol parameters, and web server settings. This allows for easy deployment across different environments without code changes.

**State Management**: Centralized bot state tracking including connection status, position coordinates, patrol parameters, and player interactions. The state is shared between the bot engine and web interface for real-time updates.

### Design Patterns

**Event-Driven Architecture**: The bot responds to Minecraft server events (spawn, error, chat, etc.) and updates state accordingly. This ensures responsive behavior and proper error handling.

**Configuration-Driven Deployment**: All environment-specific settings are externalized to config.json, making the application portable across different servers and environments.

**Real-Time Monitoring**: The web interface provides live status updates, enabling administrators to monitor bot behavior without connecting to the game server.

### Data Flow

The bot connects to Minecraft servers and maintains real-time state information. The web server exposes this state through a dashboard interface, allowing users to monitor bot activities, position, health, and patrol status. Configuration parameters control bot behavior including patrol radius and center coordinates.

## External Dependencies

**Mineflayer**: Primary Minecraft bot framework providing server connection, protocol handling, and game interaction capabilities.

**Express.js**: Web server framework for the monitoring dashboard and API endpoints.

**CORS**: Cross-Origin Resource Sharing middleware for web API access.

**Node.js Runtime**: JavaScript runtime environment for both bot and web server components.

**Minecraft Server**: Target game server that the bot connects to and interacts with.

**File System**: Local JSON configuration file storage for deployment settings and bot parameters.