# El Impostor — Juego de adivinanza social (HTML/CSS/JS)

Aplicación web estática para jugar “El Impostor” entre amigos. Todo corre en el navegador, sin backend, e integra Google Gemini para generar la palabra secreta y una pista para el impostor.

## Características
- Flujo completo: instrucciones → configuración → registro → revelación por turnos
- Integración con Google Gemini vía `fetch`
- Selección aleatoria del impostor
- Interfaz táctil optimizada (iPhone/iPad)
- Diseño responsive y animaciones suaves
- Persistencia de configuración y estado en `localStorage`
- Sin dependencias externas

## Requisitos
- Navegador moderno (Safari iOS 15+, Chrome/Firefox/Edge)
- Conexión a internet para usar Gemini
- API key de Google Gemini (Google AI Studio)

## Estructura del proyecto
```
impostor/
├── index.html          # Página principal con instrucciones
├── config.html         # Configuración (API key + tema opcional)
├── players.html        # Registro de jugadores
├── game.html           # Interfaz de revelación por turnos
├── css/
│   ├── main.css
│   ├── responsive.css
│   └── animations.css
├── js/
│   ├── storage.js      # Wrapper de localStorage
│   ├── main.js         # Lógica de inicio
│   ├── config.js       # Validación/guardado de configuración
│   ├── players.js      # Gestión de jugadores
│   ├── gemini.js       # Llamadas a Gemini y fallbacks
│   └── game.js         # Lógica de turnos y revelación
```

## Ejecutar en local
Para evitar problemas de CORS y `fetch`, usa un servidor HTTP local (no abras los archivos con `file://`). Elige una de estas opciones:

- Opción A — Python 3 (recomendado)
  ```bash
  cd /ruta/a/impostor
  python3 -m http.server 8000
  ```
  Luego abre `http://localhost:8000/` en el navegador.

- Opción B — Node.js
  ```bash
  # con npx http-server
  npx http-server -p 8000 .
  # o con npx serve
  npx serve -l 8000 .
  ```

- Opción C — VS Code
  - Instala la extensión “Live Server”
  - Click derecho sobre `index.html` → “Open with Live Server”

## Primeros pasos (uso)
1. Abre `index.html` desde tu servidor local (o tu URL de GitHub Pages).
2. Toca “Comenzar Juego”. Si no hay configuración previa, irás a Configuración.
3. En Configuración, ingresa tu API key de Google Gemini y un tema (opcional) y confirma.
   - Consigue tu API key en Google AI Studio: https://makersuite.google.com/app/apikey
4. Registra al menos 3 jugadores en orden horario y pulsa “Iniciar Juego”.
5. Pasa el dispositivo y, por turnos, cada jugador toca para revelar su rol:
   - Jugador normal: ve la palabra secreta.
   - Impostor: ve que es el impostor y recibe una pista.
6. Una vez revelados todos, usa “Ver Resultados” y comienza la discusión.

## Despliegue en GitHub Pages
1. Crea un repositorio en GitHub y sube el contenido del proyecto (raíz).
2. En GitHub: Settings → Pages → Build and deployment
   - Source: `Deploy from a branch`
   - Branch: `main` (o la que uses) y carpeta `/ (root)`
3. Guarda. Tu sitio quedará disponible como `https://<tu-usuario>.github.io/<tu-repo>/`.
4. Abre esa URL y juega desde el navegador del iPhone/iPad.

## Configuración y almacenamiento
- La configuración (API key y tema) se guarda en `localStorage` con una validez de 24 horas.
- El estado del juego (jugadores, palabra, pista, índice del impostor y progreso) se guarda en `localStorage` y se actualiza durante la partida.
- Puedes borrar todo desde el botón “Reiniciar” en la pantalla de juego o limpiando el almacenamiento del sitio en el navegador.

## Seguridad de la API key (importante)
- Esta es una aplicación 100% cliente. Las llamadas a Gemini se hacen desde el navegador y la API key queda expuesta al cliente.
- Usa una API key restringida por dominios (HTTP referrers). Para desarrollo, permite `http://localhost` y, para producción, tu dominio de GitHub Pages.
- Considera rotar tu clave si sospechas uso indebido.

## Solución de problemas
- Error 401/403 al generar palabra: verifica que tu API key sea válida y que las restricciones de la clave permitan tu dominio (`localhost` o tu GitHub Pages).
- La pantalla no revela el rol: asegúrate de tocar dentro del área indicada y que haya al menos 3 jugadores registrados.
- “Continuar Juego” no aparece en inicio: si hay configuración guardada, el botón cambia automáticamente; si no, vuelve a Configuración.
- No carga estilos/JS al abrir directo el archivo: usa un servidor HTTP local (ver “Ejecutar en local”).

## Licencia
Uso personal/educativo. Ajusta a tus necesidades o añade una licencia si deseas distribuir.
