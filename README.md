# Demo Recorder

A tool for automatically recording web application demos using Puppeteer. Creates smooth, professional-looking demo videos with visible mouse movements and natural interactions.

## Features

- Record automated demos of web applications
- Smooth mouse movements with visual cursor indicator
- Support for various interactions:
  - Clicking elements
  - Typing in input fields and textareas
  - Selecting from dropdowns
  - Navigation
  - Timed waits
- Configurable recording settings
- TOML-based configuration

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
alias demo-record='function _demo_record() { npm run --prefix /absolute/path/to/demo-recorder start "$(pwd)"; }; _demo_record'
```

Replace `/absolute/path/to/demo-recorder` with the actual path where you cloned the repository.

4. Source your shell configuration:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Usage

1. Create a `.demo-recorder.toml` file in your project directory:
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
name = "my-nuxt-app"
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

[[steps]]
type = "input"
selector = "[type='password']"
value = "${auth.password}"

[[steps]]
type = "click"
selector = "[type='submit']"

[[steps]]
type = "wait"
duration = 2000

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

### Navigate
```toml
[[steps]]
type = "navigate"
path = "/some-path"  # Will be appended to baseUrl
```

### Input
```toml
[[steps]]
type = "input"
selector = "[data-test='field-name']"
value = "Text to type"
```

### Select
```toml
[[steps]]
type = "select"
selector = "[data-test='dropdown']"
option = "[data-test='option-value']"  # Selector for the option to click
```

### Click
```toml
[[steps]]
type = "click"
selector = "[data-test='button']"
```

### Wait
```toml
[[steps]]
type = "wait"
duration = 2000  # milliseconds
```

### Pause

the transition is optional. 
Supported transitions are "fade" and "dissolve".
```toml
[[steps]]
type = "pause"
transition = { type = "fade", duration = 500, options = { color = "#FFFFFF" } }
```


## Environment Variables

Sensitive data like credentials should be provided through environment variables. Create a `.env` file in your project:

```bash
DEMO_USER_EMAIL=demo@example.com
DEMO_USER_PASSWORD=your-password
```

## Requirements

- Node.js 16+
- FFmpeg (for video recording)
- A running web application to record

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