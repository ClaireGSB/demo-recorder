# Demo Recorder

A tool for automatically recording web application demos using Puppeteer. Creates smooth, professional-looking demo videos with visible mouse movements and natural interactions.

## Features

-   **Configurable Recording Steps:** Define a series of browser actions (navigation, input, clicks, etc.) in a TOML configuration file.
-   **Smooth Mouse Movements:** Utilizes a custom mouse helper to simulate natural cursor movements.
-   **Flexible Input Handling:** Supports typing text into input fields and textareas, with configurable typing speeds.
-   **Select Element Support:**  Handles dropdown selections by selector or text.
-  **Pause and Resume:** Allows recording to be paused and resumed with the option of applying transitions between segments.
-   **Transitions:** Supports fade and dissolve transitions between recording segments using FFmpeg, customizable by duration and options.

## Dependencies

-   **mouse-helper:** Visualizes mouse movements during recording.
-   **puppeteer:**  Provides high-level API to control headless Chrome or Chromium over the DevTools Protocol.
-   **toml:**  For parsing TOML configuration files.

## Prerequisites
-   **Node.js:** Ensure you have Node.js (v18 or higher) and npm/yarn installed.
-   **FFmpeg:**  FFmpeg must be installed and available in your system's PATH for video encoding.


## Installation

1. Clone the repository:
```bash
git clone [your-repo-url]
cd demo-recorder
```

2. Install dependencies:
```bash
npm install
```

3. Add the tool to your shell configuration (`~/.bashrc` or `~/.zshrc`):
```bash
alias demo-init='function _demo_init() { npm run --prefix /absolute/path/to/demo-recorder init "$(pwd)"; }; _demo_init'

alias demo-record='function _demo_record() { npm run --prefix /absolute/path/to/demo-recorder start "$(pwd)"; }; _demo_record'
```

Replace `/absolute/path/to/demo-recorder` with the actual path where you cloned the repository.

4. Source your shell configuration:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Usage

1. Create a `.demo-recorder.toml` file in your project directory  or run yarn demo-init to create a template file:
```bash
cp /path/to/demo-recorder/.demo-recorder.template.toml /your/project/.demo-recorder.toml
```

2. Configure your recording steps in the TOML file

3. Run the recorder from your project directory:
```bash
demo-record
```

## Configuration Example

Here's a complete example of a `.demo-recorder.toml` file:

```toml
# Project configuration
[project]
name = "My-app"
baseUrl = "http://localhost:3000"

[project.viewport]
width = 1280
height = 800

# Authentication (optional)
[auth]
email = "${DEMO_USER_EMAIL}"
password = "${DEMO_USER_PASSWORD}"

# Recording settings
[recording]
output = "recordings/login-flow.mp4"
fps = 30
quality = 90

# Demo recording steps
[[steps]]
type = "navigate"
path = "/login"

[[steps]]
type = "wait"
duration = 1000

[[steps]]
type = "input"
selector = "[type='email']"
value = "${auth.email}"
# Uses default fast typing since no typeConfig specified


[[steps]]
type = "input"
selector = "[type='password']"
value = "${auth.password}"
typeConfig = { slowType = true, typeDelay = 150 }  # Override for slow typing

[[steps]]
type = "click"
selector = "[type='submit']"

[[steps]]
type = "wait"
duration = 1000

[[steps]]
type = "select"
selector = "[data-test='content-type-select']"
option = "[data-test='content-type-twitter_post']"

[[steps]]
type = "input"
selector = "[data-test='topic']"
value = "The Future of AI"

[[steps]]
type = "input"
selector = "[data-test='additional_instructions'] textarea"
value = "Include specific examples and use cases"
```

## Step Types
*### navigate
- **description**: Navigates to a specified path.

### input
- **description**: Types text into a selector.
- **selector**: CSS selector of the input.
- **value**: The text to type.
- **typeConfig**: (Optional) Overrides the default typing configurations.
- **slowType**
  - **description**: If true, will type slowly using the delay in `typeDelay`.
- **typeDelay**
  - **description**: How much to wait in milliseconds between each typed character when using `slowType`.

### select
- **description**: Selects an option from a dropdown.
- **selector**: CSS selector of the select element.

NOTE: it seems like we need a different format if the selector is a class... To investigate further

- **option**: CSS selector of the option to select.

### click
- **description**: Clicks on an element by selector.

### wait
- **description**: Waits for a specified duration in milliseconds.

### scrollDown
- **description**: Scrolls down a specific number of pixels over a duration.
- **pixels**: Number of pixels to scroll down.
- **duration**: (Optional) Duration of the scroll animation (ms).

### startRecording
- **description**: Starts recording the screen.

### stopRecording
- **description**: Stops recording and processes the video.

### pauseRecording
- **description**: Pauses the recording, optionally with a transition.
- **transition**
  - **description**: (Optional) Configuration for the transition effect.
  - **type**: `fade` or `dissolve`.
  - **duration**: Duration of the transition in milliseconds.
  - **options**
    - **fade**
      - **color**: e.g. `"#FFFFFF"`
    - **dissolve**
      - **strength**: A numeric value for the strength of the effect.

### resumeRecording
- **description**: Resumes the recording.



## Troubleshooting

1. **Mouse Helper Not Visible**
   - Check if mouse-helper is installed: `npm install mouse-helper`

2. **Recording Fails**
   - Ensure FFmpeg is installed on your system
   - Check if the output directory exists
   - Verify all selectors in your config exist in the page

3. **Selectors Not Found**
   - Use browser dev tools to verify selectors
   - Ensure the page is fully loaded (add wait steps if needed)
   - Check if elements are in iframes or shadow DOM

## License

MIT