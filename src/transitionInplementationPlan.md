# Video Transition Implementation Plan (Revised)

## Overview
Adding support for smooth transitions between video segments during pause/resume operations in our screen recording tool. This enhances the final video quality by masking loading times with professional transitions.

## Current Architecture Review
- Single continuous video output
- Basic pause/resume functionality
- Separate FFmpeg sessions per recording segment
- No segment blending capability

## Enhanced Architecture

### Configuration Schema
```toml
[[steps]]
type = "resumeRecording"
transition = {
  type = "fade" | "pixelize"
  duration = 1000  # milliseconds
  options = {
    squares = 20    # For pixelize: number of squares
    color = "black" # For fade: color to fade through
  }
}
```

### Core Components
```plaintext
recorder/
├── transitions/
│   ├── TransitionManager.ts
│   │   - Dynamic filter graph generation
│   │   - Transition timing management
│   │   - Progress monitoring
│   │
│   ├── transitions.ts
│   │   - FFmpeg filter configurations
│   │   - Transition type implementations
│   │
│   └── types.ts
│       - Interface TransitionType = 'fade' | 'pixelize'
│       - Interface TransitionOptions
│
├── segments/
│   ├── SegmentManager.ts
│   │   - Temp file lifecycle management
│   │   - Segment metadata tracking
│   │   - Memory pressure monitoring
│   │   - Cleanup routines
│   │
│   └── types.ts
│       - Interface Segment {
│           path: string;
│           duration: number;
│           frameCount: number;
│         }
│
└── progress/
    └── ProgressTracker.ts
        - Frame-based progress tracking
        - Multi-stage progress reporting
        - Time estimation
```

### Progress Tracking Architecture
```typescript
interface TransitionProgress {
  stage: 'preparing' | 'transitioning' | 'finalizing';
  percent: number;
  currentSegment: number;
  totalSegments: number;
  estimatedTimeRemaining: number;
}

class ProgressTracker {
  private totalFrames: number;
  private processedFrames: number;
  
  constructor(segments: Segment[]) {
    this.totalFrames = segments.reduce((sum, seg) => sum + seg.frameCount, 0);
  }
  
  updateProgress(currentFrame: number, stage: TransitionProgress['stage']) {
    // Emit detailed progress events
  }
}
```

### Technical Implementation Details

#### 1. Segment Management
```typescript
class SegmentManager {
  private segments: Segment[] = [];
  private tmpDir: string;
  private useMemoryBuffers: boolean = true;

  async addSegment(videoBuffer: Buffer): Promise<Segment> {
    this.checkMemoryPressure();
    
    const info = await this.getVideoInfo(videoBuffer);
    const path = path.join(this.tmpDir, `segment-${this.segments.length + 1}.mp4`);
    
    if (this.useMemoryBuffers) {
      this.segmentBuffers.set(path, videoBuffer);
    } else {
      await fs.promises.writeFile(path, videoBuffer);
    }
    
    const segment = { path, duration: info.duration, frameCount: info.frames };
    this.segments.push(segment);
    return segment;
  }

  private checkMemoryPressure() {
    const used = process.memoryUsage();
    if (used.heapUsed / used.heapTotal > 0.85) {
      this.useMemoryBuffers = false;
      this.flushBuffersToFiles();
    }
  }

  async cleanup() {
    for (const segment of this.segments) {
      await fs.promises.unlink(segment.path).catch(() => {});
    }
    await fs.promises.rmdir(this.tmpDir).catch(() => {});
  }
}
```

#### 2. FFmpeg Filter Graphs
```typescript
class TransitionManager {
  private buildFilterGraph(segments: Segment[]): string {
    const filters: string[] = [];
    let inputCount = 0;
    
    segments.forEach((segment, i) => {
      if (i < segments.length - 1) {
        // Dynamic transition timing based on segment duration
        filters.push(`[${inputCount}:v]fade=t=out:st='if(gte(t,${segment.duration-1}),t,0)':d=1[v${inputCount}];`);
        filters.push(`[${inputCount+1}:v]fade=t=in:st=0:d=1[v${inputCount+1}];`);
        inputCount += 2;
      }
    });
    
    // Concatenate all segments
    const inputs = Array.from({length: segments.length}, (_, i) => `[v${i}]`).join('');
    filters.push(`${inputs}concat=n=${segments.length}:v=1[outv]`);
    
    return filters.join('\n');
  }
}
```

#### 3. Error Recovery
```typescript
class TransitionProcessor {
  private async processWithRecovery() {
    try {
      await this.startFFmpeg();
    } catch (error) {
      if (this.hasPartialOutput()) {
        await this.recoverPartialOutput();
      }
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async cleanup() {
    await this.segmentManager.cleanup();
    this.cleanupTempFiles();
  }
}
```

### Example FFmpeg Commands

#### Fade Transition 
```bash
ffmpeg -i segment1.mp4 -i segment2.mp4 -filter_complex \
"[0:v]fade=t=out:st='if(gte(t,PREV_DURATION-1),t,0)':d=1[v0]; \
 [1:v]fade=t=in:st=0:d=1[v1]; \
 [v0][v1]concat=n=2:v=1[v]" \
-map "[v]" output.mp4
```

#### Pixelize Transition 
```bash
ffmpeg -i segment1.mp4 -i segment2.mp4 -filter_complex \
"[0:v]scale=iw/${squares}:-1,scale=${squares}*iw:${squares}*ih:flags=neighbor[v0]; \
 [1:v]scale=iw/${squares}:-1,scale=${squares}*iw:${squares}*ih:flags=neighbor[v1]; \
 [v0][v1]concat=n=2:v=1[v]" \
-map "[v]" output.mp4
```

## Implementation Phases

### Phase 1: Segment Management [Priority: High]
- [x] Implement SegmentManager with temp file handling
- [x] Add segment metadata tracking
- [x] Implement memory pressure monitoring
- [x] Add cleanup routines

### Phase 2: Basic Transitions [Priority: High]
- [ ] Create TransitionManager with dynamic filter graphs
- [ ] Implement fade transition
- [ ] Add frame-based progress tracking
- [ ] Implement error recovery

### Phase 3: Enhanced Features [Priority: Medium]
- [ ] Add pixelize transition
- [ ] Enhance progress reporting
- [ ] Add time remaining estimation
- [ ] Implement partial output recovery

### Phase 4: Testing & Optimization [Priority: High]
- [ ] Test with large segments
- [ ] Verify memory management
- [ ] Test error recovery
- [ ] Performance profiling

## Performance Considerations
- Use temp files for segments > 100MB
- Monitor memory usage and adapt strategy
- Single-pass encoding for speed
- Frame-based progress tracking for accuracy
- Cleanup on process exit

This revised plan addresses the key issues while maintaining simplicity and adding necessary safeguards for production use.