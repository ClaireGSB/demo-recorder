# Zoom Feature Guide

This guide explains how to use the zoom feature in demo-recorder to create professional-looking focus effects in your screen recordings.

## Basic Zoom Usage

The simplest way to use zoom is to focus on a specific element:

```toml
[[steps]]
type = "zoom"
target = "#element-selector"
scale = 1.5              # 1.5x zoom level
duration = 1500          # 1.5 seconds for the animation
easing = "ease-in-out"   # Smooth acceleration and deceleration
```

### Basic Parameters

- **`target`**: CSS selector for the element to zoom to
- **`scale`**: Zoom level (1.0 = normal size, 2.0 = double size)
- **`duration`**: Length of zoom animation in milliseconds
- **`easing`**: CSS easing function (ease, ease-in, ease-out, ease-in-out, linear). Defalut: ease-in-out
- **`waitForCompletion`**: Whether to wait for zoom to complete before next step (default: true)
- **`padding`**: Extra space around the target element in pixels (default: 0)

## Advanced Zoom Options

### Element Sizing (Fit Mode)

You can automatically calculate the zoom level to make an element take up a specific percentage of the viewport:

```toml
[[steps]]
type = "zoom"
target = "#element-selector"
fitWidth = 70            # Make element take 70% of viewport width
duration = 1500
```

Or fit to a percentage of viewport height:

```toml
[[steps]]
type = "zoom"
target = "#element-selector"
fitHeight = 80           # Make element take 80% of viewport height
duration = 1500
```

You can also control how the aspect ratio is handled:

```toml
[[steps]]
type = "zoom"
target = "#element-selector"
fitWidth = 70
fitHeight = 80
fitMode = "contain"      # "contain" (default) ensures entire element is visible
# fitMode = "cover"      # "cover" fills the target area but may crop the element
duration = 1500
```

### Focus Point Control

By default, zoom focuses on the center of an element. You can change which part of the element remains in view:

```toml
[[steps]]
type = "zoom"
target = "#element-selector" 
scale = 1.8
focusPoint = "top-left"  # Focus on the top-left corner
duration = 1500
```

Available focus points:
- `center` (default)
- `top`, `bottom`, `left`, `right`
- `top-left`, `top-right`, `bottom-left`, `bottom-right`

## Returning to Normal View

Always include a step to return to normal view after zooming:

```toml
[[steps]]
type = "zoom"
target = "#same-or-different-element"
scale = 1.0              # 1.0 = normal size
duration = 1000          # 1 second animation
easing = "ease-in-out"
```

## Zooming to Points

You can zoom to specific coordinates instead of elements:

```toml
[[steps]]
type = "zoomToPoint"
x = 640                 # X coordinate
y = 400                 # Y coordinate
scale = 1.7             # Zoom level
duration = 1200         # Animation duration
padding = 100           # Area size around the point
```

## Zoom Sequences

For more complex presentations, use a sequence of zooms:

```toml
[[steps]]
type = "zoomSequence"
steps = [
  { target = ".overview", scale = 1.3, duration = 800 },
  { target = ".detail-1", scale = 1.8, duration = 800 },
  { target = ".detail-2", scale = 2.0, duration = 800 }
]
overlap = 300           # Each zoom starts 300ms before previous ends
```

## Tips for Effective Zooming

1. **Keep it subtle**: Use moderate zoom levels (1.2-1.8x) for most cases
2. **Smooth timing**: Use longer durations (1000-2000ms) for smoother effects
3. **Always zoom out**: Return to normal view (scale=1.0) before ending
4. **Use padding**: Add padding around small elements for better focus
5. **Combine with pauses**: Add wait steps before/after important zooms
6. **High FPS**: Use higher FPS (60) in recording settings for smoother zooms

## Troubleshooting

If you experience issues with the zoom effect:

1. **Jumpy zooms**: Increase the duration for smoother animation
2. **Element not visible**: Make sure the element exists and is visible
3. **Zoom doesn't reset**: Add explicit reset step with scale=1.0
4. **Recording issues**: Test with the provided zoom-test.ts script 

## Example Sequence

Here's a complete example of focusing on a form element:

```toml
# Zoom to form
[[steps]]
type = "zoom"
target = "#login-form"
scale = 1.5
duration = 1500
padding = 20

# Interact with form while zoomed
[[steps]]
type = "input"
selector = "#username"
value = "demo@example.com"

[[steps]]
type = "input"
selector = "#password"
value = "password123"

# Return to normal view
[[steps]]
type = "zoom"
target = "#login-form"
scale = 1.0
duration = 1000
```