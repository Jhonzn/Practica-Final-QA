# Instalación y configuración de NodeBB con Docker

## 1. Descripción

Este documento describe el proceso realizado para instalar y ejecutar **NodeBB** utilizando Docker Desktop, Docker Compose y MongoDB en Windows.

El objetivo es preparar un entorno local para realizar pruebas funcionales, automatizadas y de seguridad como parte del proyecto de Aseguramiento de la Calidad del Software.

## 2. Tecnologías utilizadas

- NodeBB: aplicación de foros y comunidades.
- Docker Desktop: administración de contenedores.
- Docker Compose: configuración y ejecución de servicios.
- MongoDB 7: sistema de gestión de base de datos.
- Node.js: entorno de ejecución de NodeBB.
- PowerShell: ejecución de comandos en Windows.
- WSL 2: entorno de virtualización utilizado por Docker Desktop.

## 3. Requisitos previos

Antes de comenzar, se requiere:

- Windows 10 u 11.
- Docker Desktop instalado y funcionando.
- WSL 2 habilitado.
- Git instalado.
- Conexión a Internet.
- Espacio suficiente en disco para imágenes, dependencias y contenedores.

## 4. Obtener el proyecto

Repositorio oficial:

https://github.com/NodeBB/NodeBB

Clonar el repositorio:

```powershell
git clone https://github.com/NodeBB/NodeBB.git
```

Ingresar a la carpeta:

```powershell
cd NodeBB
```

Verificar los archivos necesarios:

```powershell
Test-Path .\Dockerfile
Test-Path .\install\docker\entrypoint.sh
```

Ambos comandos deben devolver `True`.

## 5. Revisar la configuración de Docker Compose

Verificar la configuración de los servicios:

```powershell
docker compose config
```

El entorno utiliza dos servicios principales:

| Servicio | Descripción | Puerto |
|---|---|---|
| `nodebb` | Aplicación del foro | 4567 |
| `mongo` | Base de datos MongoDB | 27017 |

### 5.1. Volúmenes persistentes

La configuración contempla los siguientes volúmenes:

| Volumen | Ruta de destino | Propósito |
|---|---|---|
| `mongo-data` | `/data/db` | Datos de MongoDB |
| `nodebb-build` | `/usr/src/app/build` | Archivos de compilación |
| `nodebb-uploads` | `/usr/src/app/public/uploads` | Archivos cargados |
| `nodebb-config` | `/opt/config` | Configuración de NodeBB |

Estos volúmenes permiten conservar información entre ejecuciones.

## 6. Solución de problemas con los finales de línea

Durante el primer intento de ejecución apareció el siguiente error:

```text
env: 'node\r': No such file or directory
```

Este problema está relacionado con los finales de línea de Windows y Linux:

- CRLF (`0D 0A`): formato habitual de Windows.
- LF (`0A`): formato utilizado por los scripts de Linux.

### 6.1. Convertir el entrypoint a LF

Se utilizó PowerShell para convertir el archivo `install/docker/entrypoint.sh`:

```powershell
$path = ".\install\docker\entrypoint.sh"

$content = [System.IO.File]::ReadAllText((Resolve-Path $path))

$content = $content -replace "`r`n", "`n"

$encoding = New-Object System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
    (Resolve-Path $path),
    $content,
    $encoding
)
```

Verificar el formato:

```powershell
git ls-files --eol install/docker/entrypoint.sh Dockerfile
```

El archivo `entrypoint.sh` debe quedar con formato LF.

### 6.2. Diagnosticar el archivo ejecutable de NodeBB

También se investigó el archivo `nodebb` porque el error persistía.

Inspeccionar el archivo local:

```powershell
Format-Hex .\nodebb | Select-Object -First 2
```

Comprobar el archivo dentro de Docker:

```powershell
docker compose run --rm --no-deps --entrypoint sh nodebb -c "head -n 1 /usr/src/app/nodebb | od -An -t x1"
```

Se realizaron construcciones de diagnóstico para comparar el contenido:

```powershell
docker build --target build -t nodebb-build-debug .
```

```powershell
docker run --rm --entrypoint sh nodebb-build-debug -c "sha256sum /usr/src/app/nodebb; head -n 1 /usr/src/app/nodebb | od -An -t x1"
```

También se construyó una imagen final independiente:

```powershell
docker build --no-cache -t nodebb-final-debug .
```

La imagen final de diagnóstico conservó el archivo con formato LF, igual que el archivo local.

## 7. Trasladar el almacenamiento de Docker a otro disco

Durante las construcciones se presentaron errores de almacenamiento:

```text
failed to create temp dir
read-only file system
```

Posteriormente apareció:

```text
input/output error
```

Se identificó que el disco C: tenía aproximadamente 500 MB disponibles, espacio insuficiente para continuar con las construcciones.

### 7.1. Liberar espacio

Se liberó espacio en Windows para permitir que Docker pudiera descargar dependencias y generar imágenes.

### 7.2. Cambiar la ubicación del almacenamiento

Se trasladó el almacenamiento de Docker Desktop al disco D:.

Ruta seleccionada:

```text
D:\DockerDesktopData
```

Procedimiento:

1. Abrir Docker Desktop.
2. Ingresar a Settings.
3. Seleccionar Resources.
4. Abrir Advanced.
5. Buscar Disk image location.
6. Seleccionar la nueva ubicación en D:.
7. Aplicar los cambios mediante Apply & Restart.

### 7.3. Reiniciar WSL

Se ejecutó el siguiente comando desde PowerShell:

```powershell
wsl --shutdown
```

Después se abrió nuevamente Docker Desktop y se verificó su funcionamiento.

**Importante:** el traslado del almacenamiento de Docker Desktop no implica trasladar automáticamente las carpetas locales utilizadas como volúmenes de tipo bind mount.

## 8. Construir la imagen de NodeBB

Desde la carpeta raíz del proyecto se ejecutó:

```powershell
docker compose build nodebb
```

Este comando construye la imagen de NodeBB utilizando el Dockerfile del repositorio.

Durante la construcción se instalan las dependencias de producción mediante:

```dockerfile
RUN npm install --omit=dev
```

## 9. Iniciar los servicios

Para iniciar NodeBB y MongoDB:

```powershell
docker compose up
```

Para iniciar los servicios en segundo plano:

```powershell
docker compose up -d
```

Comprobar el estado:

```powershell
docker compose ps
```

Consultar los registros de NodeBB:

```powershell
docker compose logs -f nodebb
```

Consultar los registros de MongoDB:

```powershell
docker compose logs -f mongo
```

## 10. Configuración de conexión con MongoDB

Durante la instalación de NodeBB se deben utilizar los parámetros definidos en Docker Compose.

| Parámetro | Valor |
|---|---|
| Motor de base de datos | MongoDB |
| Host | `mongo` |
| Puerto | `27017` |
| Base de datos | `nodebb` |
| Usuario | `nodebb` |
| Contraseña | `nodebb` |
| Base de autenticación | `admin` |

Si el instalador solicita una URI de conexión:

```text
mongodb://nodebb:nodebb@mongo:27017/nodebb?authSource=admin
```

**Nota:** el nombre `mongo` corresponde al servicio de Docker Compose. No se debe utilizar `localhost` para la comunicación interna entre NodeBB y MongoDB.

Los valores anteriores corresponden a la configuración local de desarrollo. No deben utilizarse como credenciales de producción.

## 11. Acceso a NodeBB

Una vez iniciados los servicios, ingresar desde el navegador:

```text
http://localhost:4567
```

La aplicación presenta la pantalla de instalación inicial.

Durante este proceso se debe configurar:

- Nombre del foro.
- Dirección de acceso.
- Usuario administrador.
- Contraseña del administrador.
- Conexión con MongoDB.

Las credenciales administrativas deben ser de prueba y no reutilizar contraseñas personales.

## 12. Comandos de administración

| Acción | Comando |
|---|---|
| Iniciar servicios | `docker compose up` |
| Iniciar en segundo plano | `docker compose up -d` |
| Detener servicios | `docker compose down` |
| Reconstruir NodeBB | `docker compose build nodebb` |
| Ver contenedores | `docker compose ps` |
| Consultar registros | `docker compose logs -f nodebb` |
| Ver imágenes | `docker image ls` |
| Ver volúmenes | `docker volume ls` |
| Ver configuración | `docker compose config` |

**Advertencia:** evitar `docker compose down -v`, ya que elimina los volúmenes asociados y puede ocasionar pérdida de datos.



**Proyecto:** Aseguramiento de la Calidad del Software.

**Sistema evaluado:** NodeBB.

**Entorno:** Windows + Docker Desktop + Docker Compose + MongoDB.