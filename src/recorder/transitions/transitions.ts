// src/recorder/transitions/transitions.ts
export const generateFadeFilterGraph = (
  segmentCount: number,
  transitionDuration: number
): string => {
  const filters: string[] = [];
  
  for (let i = 0; i < segmentCount; i++) {
    if (i < segmentCount - 1) {
      // Add fade out to current segment
      filters.push(`[${i}:v]split[v${i}][v${i}fade];`);
      filters.push(
        `[v${i}fade]fade=t=out:st='if(gte(t,${transitionDuration/1000}),t,0)':d=${transitionDuration/1000}[v${i}out];`
      );
      
      // Add fade in to next segment
      filters.push(`[${i+1}:v]fade=t=in:st=0:d=${transitionDuration/1000}[v${i+1}in];`);
    }
  }

  // Build the concat filter with all segments
  const concatInputs = Array.from(
    { length: segmentCount }, 
    (_, i) => i < segmentCount - 1 ? `[v${i}out][v${i+1}in]` : ''
  ).join('');
  
  filters.push(`${concatInputs}concat=n=${segmentCount}:v=1[outv]`);
  
  return filters.join('\n');
};
