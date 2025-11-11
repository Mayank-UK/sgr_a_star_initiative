(function setTitleFromFilename() {
  if (document.title && document.title.trim() !== "") return;
  const fileName = window.location.pathname.split("/").pop().split(".")[0];
  const formattedTitle = fileName
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  document.title = formattedTitle;
})();

// Performance optimizations - Caching and utilities
const DOM_CACHE = new Map();
const COMPUTATION_CACHE = new Map();
const REGEX_PATTERNS = {
  leadingSpaces: /^ */,
  marker: /^([-•\d+a-zA-Z]+[).\-:]?\s+)(.*)/,
  punctuation: /[.:?]$/,
  htmlTags: /<(img|div|thead|tbody|tr|td|th)[\s>]/i,
  tabs: /\t/g,
  question: /\?$/,
  colon: /:$/,
  tablePlaceholder: /__TABLE_PLACEHOLDER_\d+__/
};

function getCachedElement(selector) {
  if (!DOM_CACHE.has(selector)) {
    DOM_CACHE.set(selector, document.querySelector(selector));
  }
  return DOM_CACHE.get(selector);
}

function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function createSectionChecker() {
  const consolidatedRegex = /consolidated/i;
  const baseRegex = /base|content/i;
  const pyqRegex = /pyq/i;
  
  return {
    isConsolidated: (id) => consolidatedRegex.test(id),
    isBase: (id) => baseRegex.test(id),
    isPyq: (id) => pyqRegex.test(id)
  };
}

const sectionChecker = createSectionChecker();

// Improved Scroll Estimator - Optimized for intermittent tracking
class ImprovedScrollEstimator {
  constructor() {
    this.dataPoints = []; // { time, scrollPos } - raw scroll data
    this.windowStart = Date.now();
    this.recordInterval = 500; // Record scroll every 500ms (more frequent for visible moments)
    this.lastRecordTime = Date.now();
    this.lastScrollPos = 0;
    
    // Adaptive thresholds
    this.minJitterThreshold = 3; // Only record if changed more than 3px
    this.dataWindow = 300000; // Keep 5 minutes of data
    this.minDataPoints = 3; // Only need 3 data points (1.5 seconds of actual scrolling)
    this.readyTime = 3000; // Ready after just 3 seconds of gathered data
  }

  recordScroll(currentPos, totalHeight) {
    const now = Date.now();
    
    // Record at intervals
    if (now - this.lastRecordTime < this.recordInterval) {
      return;
    }

    // Filter jitter - only record meaningful movement
    if (Math.abs(currentPos - this.lastScrollPos) < this.minJitterThreshold) {
      return;
    }

    this.dataPoints.push({
      time: now,
      pos: currentPos
    });

    // Keep only recent data (last 5 minutes)
    const cutoffTime = now - this.dataWindow;
    this.dataPoints = this.dataPoints.filter(dp => dp.time > cutoffTime);

    this.lastRecordTime = now;
    this.lastScrollPos = currentPos;
  }

  getEstimatedTimeToCompletion(currentPos, totalHeight) {
    if (totalHeight <= 0) return null;

    const scrollPercent = (currentPos / totalHeight) * 100;
    
    if (scrollPercent >= 99) {
      return 0;
    }

    // Need minimum data points to estimate
    if (this.dataPoints.length < this.minDataPoints) {
      return null;
    }

    // Use recent data points for calculation
    // Take data from last 30 seconds if available, otherwise use all data
    const now = Date.now();
    const recentCutoff = now - 30000;
    const recentPoints = this.dataPoints.filter(dp => dp.time > recentCutoff);
    
    const pointsToUse = recentPoints.length >= this.minDataPoints ? recentPoints : this.dataPoints;

    if (pointsToUse.length < this.minDataPoints) {
      return null;
    }

    // Calculate from oldest to newest for most stable estimate
    const oldestPoint = pointsToUse[0];
    const newestPoint = pointsToUse[pointsToUse.length - 1];

    const timeElapsed = newestPoint.time - oldestPoint.time;
    const distanceCovered = newestPoint.pos - oldestPoint.pos;

    if (timeElapsed <= 0 || distanceCovered <= 0) {
      return null;
    }

    // Calculate pixels per millisecond
    const pixelsPerMs = distanceCovered / timeElapsed;

    if (pixelsPerMs <= 0) {
      return null;
    }

    // Calculate remaining distance
    const remainingDistance = totalHeight - currentPos;
    
    if (remainingDistance <= 0) {
      return 0;
    }

    // Estimate time to completion
    const estimatedMs = remainingDistance / pixelsPerMs;

    return Math.max(0, Math.round(estimatedMs));
  }

  getConfidence() {
    const now = Date.now();
    const timeSinceStart = now - this.windowStart;
    const dataPoints = this.dataPoints.length;
    
    // Check if we have enough recent data
    const recentCutoff = now - 30000;
    const recentPoints = this.dataPoints.filter(dp => dp.time > recentCutoff);

    // Ready quickly if we have good recent activity
    if (recentPoints.length >= this.minDataPoints && timeSinceStart > this.readyTime) {
      if (recentPoints.length < 5) return 0.6;
      if (recentPoints.length < 15) return 0.75;
      return 0.9;
    }

    // Otherwise use historical data
    if (dataPoints < this.minDataPoints) return 0;
    if (dataPoints < 10) return 0.4;
    if (dataPoints < 30) return 0.65;
    return 0.85;
  }

  reset() {
    this.dataPoints = [];
    this.windowStart = Date.now();
    this.lastRecordTime = Date.now();
    this.lastScrollPos = 0;
  }
}

const estimator = new ImprovedScrollEstimator();

// Create DOM elements
const loading = document.createElement("div");
loading.className = "loading-overlay";
loading.innerHTML = `
  <div class="loading-spinner"></div>
  <span>Processing content...</span>
`;

const controlsDiv = document.createElement('div');
controlsDiv.id = 'controls';
controlsDiv.innerHTML = `<div class="control-heading">📂 Sections</div>`;

const scrollControlsDiv = document.createElement('div');
scrollControlsDiv.id = 'scroll-controls';
scrollControlsDiv.innerHTML = `
  <div class="scroll-controls-buttons">
    <button id="toggleScroll">
        <i class="play-icon"></i>
    </button>
    <input type="range" id="speedRange" min="1" max="100" value="8">
    <button id="scrollUp" title="Scroll Up">
      <i class="scroll-up-icon"></i>
    </button>
    <button id="scrollDown" title="Scroll Down">
      <i class="scroll-down-icon"></i>
    </button>
  </div>
  <div class="scroll-progress-inline">
    <div class="progress-bar-inline">
      <div class="progress-fill-inline"></div>
    </div>
    <div class="progress-info">
      <span class="progress-text-inline">0%</span>
      <span class="estimated-time">-- ETA</span>
    </div>
  </div>
`;

// Add CSS styles for the inline progress display
const scrollProgressStyles = document.createElement('style');
scrollProgressStyles.textContent = `
  #scroll-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
  }

  .scroll-controls-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .scroll-progress-inline {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .progress-bar-inline {
    flex: 1;
    height: 6px;
    background: #f0f0f0;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid #d0d0d0;
  }

  .progress-fill-inline {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #66BB6A);
    width: 0%;
    transition: width 0.1s ease-out;
    border-radius: 3px;
  }

  .progress-info {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 150px;
  }

  .progress-text-inline {
    font-size: 12px;
    font-weight: 600;
    color: #333;
    min-width: 30px;
    text-align: right;
  }

  .estimated-time {
    font-size: 11px;
    font-weight: 500;
    color: #666;
    padding: 4px 6px;
    background: #f5f5f5;
    border-radius: 3px;
    border: 1px solid #e0e0e0;
    min-width: 64px;
    text-align: center;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .scroll-progress-inline {
      gap: 6px;
    }

    .progress-bar-inline {
      height: 4px;
    }

    .progress-text-inline {
      font-size: 11px;
      min-width: 30px;
    }

    .estimated-time {
      font-size: 10px;
      min-width: 70px;
      padding: 2px 6px;
    }
  }
`;
document.head.appendChild(scrollProgressStyles);

document.body.prepend(scrollControlsDiv);
document.body.prepend(controlsDiv);
document.body.appendChild(loading);

// Optimized variables
let scrollSpeed = 8;
let isScrolling = false;
let isScrollingAllowedByUser = false;
let lastScrollY = window.scrollY;
let animationId = null;
let pauseTimeout = null;
let isUserInteracting = false;
let scrollControls = null;
let lastAutoScrollY = 0;
let userScrollTimeout = null;
let accumulatedPixels = 0;
let isTableFullScreen = false;
let wasScrollingBeforeFullScreen = false;
let loadedSections = new Set();
let isProcessingSection = false;
let lastFrameTime = 0;
let scrollTimeout;

// Optimized smooth scroll with original comfortable timing
function optimizedSmoothScroll(currentTime) {
  if (!isScrolling) {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    accumulatedPixels = 0;
    return;
  }

  const deltaTime = currentTime - lastFrameTime;
  if (deltaTime < 16.67) {
    animationId = requestAnimationFrame(optimizedSmoothScroll);
    return;
  }
  
  lastFrameTime = currentTime;
  
  const pixelsPerFrame = scrollSpeed / 60;
  accumulatedPixels += pixelsPerFrame;

  if (accumulatedPixels >= 1) {
    const scrollAmount = Math.floor(accumulatedPixels);
    window.scrollBy({
      top: scrollAmount,
      behavior: 'instant'
    });
    accumulatedPixels -= scrollAmount;
    lastAutoScrollY = window.scrollY;
  }

  const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 1;
  if (!atBottom) {
    animationId = requestAnimationFrame(optimizedSmoothScroll);
  } else {
    isScrolling = false;
    animationId = null;
    accumulatedPixels = 0;
  }
}

function startAutoScroll() {
  if (!isScrolling && !isTableFullScreen) {
    isScrolling = true;
    accumulatedPixels = 0;
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(optimizedSmoothScroll);
  }
}

function stopAutoScroll() {
  isScrolling = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  accumulatedPixels = 0;
}

function pauseAutoScrollTemporarily(ms = 2000) {
  stopAutoScroll();
  if (pauseTimeout) clearTimeout(pauseTimeout);
  pauseTimeout = setTimeout(() => {
    if (isScrollingAllowedByUser && !isTableFullScreen) {
      startAutoScroll();
    }
  }, ms);
}

// Optimized scroll handlers with throttling - fixed for iPad
let isUserTouchScrolling = false;
let lastScrollDirection = null;

const throttledScrollDirection = throttle(() => {
  const currentY = window.scrollY;
  const goingUp = currentY < lastScrollY;
  
  if (scrollControls) {
    // Always show on scroll up
    if (goingUp) {
      scrollControls.style.opacity = "1";
      scrollControls.style.pointerEvents = "auto";
      isUserTouchScrolling = true;
      lastScrollDirection = 'up';
      if (scrollTimeout) clearTimeout(scrollTimeout);
    } else {
      // On scroll down, handle differently for touch vs non-touch
      lastScrollDirection = 'down';
      if ('ontouchstart' in window) {
        // On touch devices, show immediately, then hide after delay
        scrollControls.style.opacity = "1";
        scrollControls.style.pointerEvents = "auto";
        
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          // Only hide if still scrolling down and no touch interaction
          if (lastScrollDirection === 'down' && !isUserTouchScrolling) {
            scrollControls.style.opacity = "0";
            scrollControls.style.pointerEvents = "none";
          }
        }, 3000);
      } else {
        // On desktop, hide immediately on scroll down
        scrollControls.style.opacity = "0";
        scrollControls.style.pointerEvents = "none";
      }
    }
  }
  
  lastScrollY = currentY;
}, 16);

const debouncedUserScroll = debounce(() => {
  if (isScrollingAllowedByUser && !isUserInteracting) {
    const currentY = window.scrollY;
    if (Math.abs(currentY - lastAutoScrollY) > 50 || currentY < lastAutoScrollY - 10) {
      isUserInteracting = true;
      pauseAutoScrollTemporarily(2000);
      if (userScrollTimeout) clearTimeout(userScrollTimeout);
      userScrollTimeout = setTimeout(() => {
        isUserInteracting = false;
      }, 500);
    }
  }
  
  if (!isScrolling) {
    lastAutoScrollY = window.scrollY;
  }
}, 16);

// Function to format time display
function formatTime(ms) {
  const seconds = Math.round(ms / 1000);
  
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

function updateScrollProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  
  // Record scroll for estimation
  estimator.recordScroll(scrollTop, document.documentElement.scrollHeight);
  
  const scrollPercent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
  
  const progressFill = document.querySelector('.progress-fill-inline');
  const progressText = document.querySelector('.progress-text-inline');
  const estimatedTimeEl = document.querySelector('.estimated-time');
  
  if (progressFill) {
    progressFill.style.width = scrollPercent + '%';
  }
  
  if (progressText) {
    progressText.textContent = scrollPercent + '%';
  }

  if (estimatedTimeEl) {
    if (scrollPercent >= 100) {
      estimatedTimeEl.textContent = '✓ Done';
      estimatedTimeEl.style.background = '#e8f5e9';
      estimatedTimeEl.style.color = '#2e7d32';
    } else {
      const etaMs = estimator.getEstimatedTimeToCompletion(scrollTop, document.documentElement.scrollHeight);
      const confidence = estimator.getConfidence();

      if (etaMs === null) {
        estimatedTimeEl.textContent = 'Calculating...';
        estimatedTimeEl.style.background = '#f5f5f5';
        estimatedTimeEl.style.color = '#999';
      } else {
        const timeStr = formatTime(etaMs);
        estimatedTimeEl.textContent = timeStr;
        
        // Color code based on confidence
        if (confidence > 0.7) {
          estimatedTimeEl.style.background = '#fff3cd';
          estimatedTimeEl.style.color = '#856404';
        } else {
          estimatedTimeEl.style.background = '#f0f0f0';
          estimatedTimeEl.style.color = '#666';
        }
      }
    }
  }
}

// Add optimized scroll event listener for progress tracking
const throttledProgressUpdate = throttle(updateScrollProgress, 100);
window.addEventListener('scroll', throttledProgressUpdate, { passive: true });

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const estimatedTimeEl = document.querySelector('.estimated-time');
    if (estimatedTimeEl) {
      console.log('Estimated time element found and initialized');
    }
  }, 500);
}, { once: true });

// Optimized table processing
function extractTablesAndContentOptimized(htmlString) {
  const tables = [];
  let tableIndex = 0;
  
  const htmlWithPlaceholders = htmlString.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const placeholder = `__TABLE_PLACEHOLDER_${tableIndex++}__`;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-container';
    wrapper.style.position = 'relative';
    wrapper.innerHTML = match;

    const expandIcon = document.createElement('i');
    expandIcon.className = 'table-expand-icon';
    expandIcon.innerHTML = '';
    wrapper.appendChild(expandIcon);

    tables.push({
      placeholder,
      content: wrapper.outerHTML
    });

    return placeholder;
  });

  return { htmlWithPlaceholders, tables };
}

function restoreTablesInContent(processedContent, tables) {
  let restored = processedContent;
  tables.forEach(table => {
    restored = restored.replace(table.placeholder, table.content);
  });
  return restored;
}

function toggleFullScreenTable(tableContainer) {
  const table = tableContainer.querySelector('table');
  if (!table) return;

  if (tableContainer.classList.contains('fullscreen')) {
    const wrapper = document.querySelector('.fullscreen-table-wrapper');
    if (wrapper) {
      wrapper.style.opacity = '0';
      setTimeout(() => {
        wrapper.remove();
        tableContainer.style.display = 'block';
        isTableFullScreen = false;
        if (wasScrollingBeforeFullScreen && isScrollingAllowedByUser) {
          startAutoScroll();
        }
      }, 300);
    }
  } else {
    wasScrollingBeforeFullScreen = isScrolling;
    isTableFullScreen = true;
    stopAutoScroll();
    
    tableContainer.style.display = 'none';
    const wrapper = document.createElement('div');
    wrapper.className = 'fullscreen-table-wrapper';
    const fullScreenTable = document.createElement('div');
    fullScreenTable.className = 'fullscreen-table';
    fullScreenTable.innerHTML = table.outerHTML;
    wrapper.appendChild(fullScreenTable);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'fullscreen-table-close';
    closeBtn.innerHTML = '❌';
    closeBtn.addEventListener('click', () => toggleFullScreenTable(tableContainer));
    wrapper.appendChild(closeBtn);

    document.body.appendChild(wrapper);
    setTimeout(() => wrapper.classList.add('show'), 10);
  }

  tableContainer.classList.toggle('fullscreen');
}

// Optimized line processing
function optimizedProcessLine(line, index, lines) {
  const cacheKey = `${line}_${index}`;
  if (COMPUTATION_CACHE.has(cacheKey)) {
    return COMPUTATION_CACHE.get(cacheKey);
  }

  const normalized = line.replace(REGEX_PATTERNS.tabs, "    ");
  const leadingSpaces = (normalized.match(REGEX_PATTERNS.leadingSpaces)?.[0] || "").length;
  const indentLevel = Math.floor(leadingSpaces / 2);
  const cleanText = normalized.trim();
  
  if (!cleanText) {
    COMPUTATION_CACHE.set(cacheKey, { empty: true });
    return { empty: true };
  }

  const nextLine = lines[index + 1] || "";
  const nextIndent = Math.floor(((nextLine.replace(REGEX_PATTERNS.tabs, "    ").match(REGEX_PATTERNS.leadingSpaces)?.[0]) || "").length / 2);
  
  const result = {
    normalized,
    leadingSpaces,
    indentLevel,
    cleanText,
    nextIndent,
    isTable: REGEX_PATTERNS.tablePlaceholder.test(cleanText),
    isHTML: REGEX_PATTERNS.htmlTags.test(cleanText),
    endsWithPunct: REGEX_PATTERNS.punctuation.test(cleanText),
    endsWithQuestion: REGEX_PATTERNS.question.test(cleanText),
    endsWithColon: REGEX_PATTERNS.colon.test(cleanText),
    wordCount: cleanText.split(/\s+/).length,
    charLength: cleanText.length,
    markerMatch: cleanText.match(REGEX_PATTERNS.marker),
    hasChildren: nextIndent > indentLevel
  };

  result.hasMarker = result.markerMatch && result.markerMatch[1].trim().length > 0;
  result.shortEnough = result.charLength <= 100 && result.wordCount <= 12;
  result.isLikelyHeading = result.shortEnough && result.hasChildren && 
    (!result.endsWithPunct || result.endsWithColon || result.endsWithQuestion);

  COMPUTATION_CACHE.set(cacheKey, result);
  return result;
}

// Optimized parent lines generation with caching
const parentLinesCache = new Map();
function generateParentLines(level, color = "#f4f6f8") {
  const cacheKey = `${level}_${color}`;
  if (parentLinesCache.has(cacheKey)) {
    return parentLinesCache.get(cacheKey);
  }

  if (level <= 1) {
    parentLinesCache.set(cacheKey, "none");
    return "none";
  }
  
  const shadows = [];
  for (let i = 1; i < level; i++) {
    shadows.push(`${-1.5 * i}rem 0 0 ${color}`);
  }
  
  const result = shadows.join(", ");
  parentLinesCache.set(cacheKey, result);
  return result;
}

// Optimized section processing with hierarchical indent containers
function processSection(section) {
  if (loadedSections.has(section.id)) return;

  const raw = section.innerHTML.trim();
  const { htmlWithPlaceholders, tables } = extractTablesAndContentOptimized(raw);
  const lines = htmlWithPlaceholders.split("\n");

  const transformedLines = [];
  const indentStack = []; // Track nested indent levels
  
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineData = optimizedProcessLine(line, index, lines);
    
    if (lineData.empty) continue;

    const { indentLevel, cleanText } = lineData;

    // Close containers for outdented levels
    while (indentStack.length > 0 && indentStack[indentStack.length - 1] >= indentLevel) {
      transformedLines.push('</div>'); // Close indent container
      indentStack.pop();
    }

    // Open new container if we're indenting deeper
    if (indentStack.length === 0 || indentStack[indentStack.length - 1] < indentLevel) {
      // Only add padding for the relative indent increase, not absolute
      const currentIndent = indentStack.length > 0 ? indentStack[indentStack.length - 1] : 0;
      const relativeIndent = (indentLevel - currentIndent) * 1;
      transformedLines.push(`<div class="indent-level-${indentLevel}" style="padding-left: ${relativeIndent}rem; border-left: 2px solid ${indentLevel % 2 === 0 ? '#f8f8f8ff' : '#f9f9f9ff'}">`);
      indentStack.push(indentLevel);
    }

    const paddingLeft = indentLevel * 1;
    const linePosition = `${paddingLeft + 0.2}rem`;
    const customStyle = `padding-left: 0rem;`; // No padding needed, container handles it

    if (lineData.isTable) {
      transformedLines.push(`
        <div class="line paragraph no-marker table-wrapper" data-level="${indentLevel}" style="${customStyle}">
          ${cleanText}
        </div>
      `);
      continue;
    }

    if (lineData.isHTML) {
      transformedLines.push(`<div class="line paragraph no-marker" data-level="${indentLevel}" style="${customStyle}">${cleanText}</div>`);
      continue;
    }

    let cssClass = `line`;
    cssClass += indentLevel <= 5 ? ` level-${indentLevel}` : ` level-deep`;

    if (lineData.hasMarker) cssClass += " bullet";
    if (lineData.isLikelyHeading) cssClass += " heading";
    else cssClass += " paragraph";

    if (lineData.hasMarker) {
      const marker = lineData.markerMatch[1];
      const content = lineData.markerMatch[2];
      transformedLines.push(`
        <div class="${cssClass}" data-level="${indentLevel}" style="${customStyle}">
          <span class="line-marker">${marker}</span>
          <span class="line-content">${content}</span>
        </div>
      `);
    } else {
      cssClass += " no-marker";
      transformedLines.push(`
        <div class="${cssClass}" data-level="${indentLevel}" style="${customStyle}">
          <span class="line-content">${cleanText}</span>
        </div>
      `);
    }
  }

  // Close any remaining open containers
  while (indentStack.length > 0) {
    transformedLines.push('</div>');
    indentStack.pop();
  }

  const finalContent = restoreTablesInContent(transformedLines.join("\n"), tables);
  section.innerHTML = finalContent;

  const lineElements = section.querySelectorAll('.line');
  processAnswerBlocks(lineElements);

  loadedSections.add(section.id);
}

// Optimized answer block processing
function processAnswerBlocks(lineElements) {
  for (let i = 0; i < lineElements.length; i++) {
    const line = lineElements[i];
    const content = line.querySelector('.line-content');
    if (!content) continue;

    const text = content.textContent.trim();
    if (!text.startsWith('Answer:')) continue;

    const baseLevel = parseInt(line.dataset.level || '0', 10);
    const group = [line];

    for (let j = i + 1; j < lineElements.length; j++) {
      const next = lineElements[j];
      const nextLevel = parseInt(next.dataset.level || '0', 10);
      if (nextLevel <= baseLevel) break;
      group.push(next);
    }

    const nextLine = lineElements[i + group.length];
    const nextContent = nextLine?.querySelector('.line-content')?.textContent?.trim() || '';
    if (nextContent.startsWith('Analysis:')) {
      const analysisLevel = parseInt(nextLine.dataset.level || '0', 10);
      group.push(nextLine);

      for (let j = i + group.length; j < lineElements.length; j++) {
        const subLine = lineElements[j];
        const subLevel = parseInt(subLine.dataset.level || '0', 10);
        if (subLevel <= analysisLevel) break;
        group.push(subLine);
      }
    }

    createBlurredBlock(group);
    i += group.length - 1;
  }
}

function createBlurredBlock(group) {
  const wrapper = document.createElement('div');
  wrapper.className = 'blurred-block';
  wrapper.dataset.optimized = 'true';

  // Find the **deepest common indent container** among the group
  let commonIndentParent = group[0].parentElement;
  while (commonIndentParent && !commonIndentParent.classList.contains('indent-level-')) {
    commonIndentParent = commonIndentParent.parentElement;
  }

  // If no indent-level found, use the direct parent
  const insertBeforeParent = commonIndentParent || group[0].parentElement;

  // Insert wrapper at the correct position
  insertBeforeParent.insertBefore(wrapper, group[0]);

  // We'll rebuild the indent structure inside the wrapper
  const indentRoot = document.createElement('div');
  indentRoot.style.paddingLeft = '0';
  indentRoot.style.borderLeft = 'none';

  let currentContainer = indentRoot;
  const indentStack = [];

  group.forEach((line, index) => {
    const level = parseInt(line.dataset.level || '0', 10);
    const baseLevel = parseInt(group[0].dataset.level || '0', 10);

    // Calculate relative level from the first line in the group
    const relativeLevel = level - baseLevel;

    // Close excess indent levels
    while (indentStack.length > relativeLevel) {
      currentContainer = indentStack.pop();
    }

    // Open new indent levels if needed
    while (indentStack.length < relativeLevel) {
      const newIndent = document.createElement('div');
      newIndent.className = `indent-level-${baseLevel + indentStack.length + 1}`;
      newIndent.style.paddingLeft = '1rem';
      newIndent.style.borderLeft = '2px solid #f9f9f9ff';
      currentContainer.appendChild(newIndent);
      indentStack.push(currentContainer);
      currentContainer = newIndent;
    }

    // Append the line
    currentContainer.appendChild(line);
  });

  wrapper.appendChild(indentRoot);

  // Optional: Add subtle visual cue for blurred block
  wrapper.style.margin = '0.75rem 0';
  wrapper.style.borderRadius = '6px';
  wrapper.style.overflow = 'hidden';
  wrapper.style.position = 'relative';
}

// Event delegation for better performance
function setupEventDelegation() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.blurred-block[data-optimized]')) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = e.target.closest('.blurred-block');
      wrapper.classList.toggle('revealed');
      return;
    }
    
    if (e.target.classList.contains('table-expand-icon')) {
      const container = e.target.closest('.table-container');
      if (container) {
        toggleFullScreenTable(container);
      }
      return;
    }
  });

  let touchStartY = 0;
  let touchStartTime = 0;
  let hasScrolled = false;

  document.addEventListener('touchstart', (e) => {
    const blurredBlock = e.target.closest('.blurred-block[data-optimized]');
    if (blurredBlock) {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      hasScrolled = false;
    }

    // Mark touch interaction for scroll panel
    isUserTouchScrolling = true;
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isUserTouchScrolling = false;
    }, 1000);

    if (isScrollingAllowedByUser && !isUserInteracting) {
      isUserInteracting = true;
      pauseAutoScrollTemporarily(500);
      if (userScrollTimeout) clearTimeout(userScrollTimeout);
      userScrollTimeout = setTimeout(() => {
        isUserInteracting = false;
      }, 500);
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    const blurredBlock = e.target.closest('.blurred-block[data-optimized]');
    if (blurredBlock) {
      const currentY = e.touches[0].clientY;
      const deltaY = Math.abs(currentY - touchStartY);
      if (deltaY > 10) {
        hasScrolled = true;
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const blurredBlock = e.target.closest('.blurred-block[data-optimized]');
    if (blurredBlock) {
      const touchDuration = Date.now() - touchStartTime;
      if (!hasScrolled && touchDuration < 300) {
        e.preventDefault();
        e.stopPropagation();
        blurredBlock.classList.toggle('revealed');
      }
    }

    // Reset touch scrolling flag after touch ends
    isUserTouchScrolling = false;
  }, { passive: false });
}

// Intersection Observer for efficient lazy loading
const intersectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const section = entry.target;
      if (!loadedSections.has(section.id) && section.style.display !== 'none') {
        processSection(section);
        intersectionObserver.unobserve(section);
      }
    }
  });
}, {
  rootMargin: '50px'
});

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const sections = document.querySelectorAll('div[id^="section-"]');
      if (sections.length === 0) {
        console.warn("No sections found with id starting with 'section-'");
        loading.remove();
        return;
      }

      setupEventDelegation();

      const consolidatedSection = Array.from(sections).find(section => 
        sectionChecker.isConsolidated(section.id)
      );
      const baseSection = Array.from(sections).find(section => 
        sectionChecker.isBase(section.id)
      );

      const prioritySection = consolidatedSection || baseSection;
      if (prioritySection) {
        processSection(prioritySection);
      }

      const controls = getCachedElement("#controls") || document.getElementById("controls");
      if (controls) {
        const sectionDivs = document.querySelectorAll('div[id^="section-"]');
        const hasConsolidatedSection = consolidatedSection !== undefined;
        
        const controlsFragment = document.createDocumentFragment();
        
        sectionDivs.forEach((section) => {
          const sectionId = section.id;
          const labelText = sectionId.replace("section-", "");
          const isConsolidated = sectionChecker.isConsolidated(sectionId);
          const isBase = sectionChecker.isBase(sectionId);
          const shouldBeChecked = isConsolidated || (!hasConsolidatedSection && isBase);

          const wrapper = createSectionToggle(section, sectionId, labelText, shouldBeChecked);
          controlsFragment.appendChild(wrapper);

          if (!shouldBeChecked) {
            intersectionObserver.observe(section);
          }
        });
        
        controls.appendChild(controlsFragment);
      }

      const sectionsToShow = document.querySelectorAll('div[id^="section-"]');
      let visibleSectionCount = 0;
      
      sectionsToShow.forEach((section, index) => {
        const isConsolidated = sectionChecker.isConsolidated(section.id);
        const isBase = sectionChecker.isBase(section.id);
        const shouldShow = isConsolidated || (!consolidatedSection && isBase);
        
        if (shouldShow) {
          setTimeout(() => {
            section.style.setProperty('display', 'block', 'important');
            section.style.opacity = "0";
            section.style.transition = "opacity 0.3s ease-in-out";
            requestAnimationFrame(() => {
              section.style.opacity = "1";
            });
          }, visibleSectionCount * 50);
          visibleSectionCount++;
        } else {
          section.style.display = "none";
        }
      });

      setTimeout(() => {
        loading.style.opacity = "0";
        loading.style.transition = "opacity 0.3s ease-out";
        setTimeout(() => loading.remove(), 300);
      }, visibleSectionCount * 50 + 100);

      const pageTitle = document.title;
      const h1 = document.createElement("h1");
      h1.textContent = pageTitle;
      h1.style.textAlign = "center";
      h1.style.margin = "2rem 0";

      const firstSection = document.querySelector('div[id^="section-"]');
      if (firstSection) {
        firstSection.parentNode.insertBefore(h1, firstSection);
      }

      setupScrollControls();
      setupOutlineFeature();
      setupCacheBuster();
      setupNavigationWarning();
      
      updateScrollProgress();
    });
  });
});

// Optimized section toggle creation
function createSectionToggle(section, sectionId, labelText, shouldBeChecked) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("switch-wrapper");

  const label = document.createElement("label");
  label.classList.add("switch-label");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = shouldBeChecked;

  checkbox.addEventListener("change", (e) => {
    e.preventDefault();
    
    if (isProcessingSection) {
      checkbox.checked = !checkbox.checked;
      return;
    }
    
    isProcessingSection = true;
    
    const switchLoading = document.createElement("div");
    switchLoading.className = "loading-overlay";
    switchLoading.innerHTML = `
      <div class="loading-spinner"></div>
      <span>Processing section...</span>
    `;
    
    document.body.appendChild(switchLoading);
    switchLoading.offsetHeight;
    
    checkbox.disabled = true;
    
    setTimeout(() => {
      const targetSection = document.getElementById(sectionId);
      
      if (checkbox.checked) {
        if (!loadedSections.has(sectionId)) {
          processSection(targetSection);
        }
        
        targetSection.style.display = "block";
        targetSection.style.opacity = "0";
        targetSection.style.transition = "opacity 0.3s ease-in-out";
        requestAnimationFrame(() => {
          targetSection.style.opacity = "1";
        });
        
        setTimeout(() => {
          switchLoading.remove();
          checkbox.disabled = false;
          isProcessingSection = false;
          updateScrollProgress();
        }, 300);
      } else {
        targetSection.style.transition = "opacity 0.2s ease-out";  
        targetSection.style.opacity = "0";
        setTimeout(() => {
          targetSection.style.display = "none";
          switchLoading.remove();
          checkbox.disabled = false;
          isProcessingSection = false;
          updateScrollProgress();
        }, 200);
      }
    }, 10);
  });

  const slider = document.createElement("span");
  slider.classList.add("slider");

  const text = document.createElement("span");
  text.textContent = labelText;

  label.appendChild(checkbox);
  label.appendChild(slider);
  wrapper.appendChild(label);
  wrapper.appendChild(text);

  return wrapper;
}

function setupScrollControls() {
  scrollControls = getCachedElement("#scroll-controls") || document.getElementById("scroll-controls");

  const speedRange = getCachedElement("#speedRange") || document.getElementById("speedRange");
  const toggleButton = getCachedElement("#toggleScroll") || document.getElementById("toggleScroll");
  const scrollUpBtn = getCachedElement("#scrollUp") || document.getElementById("scrollUp");
  const scrollDownBtn = getCachedElement("#scrollDown") || document.getElementById("scrollDown");

  if (speedRange) {
    speedRange.addEventListener("input", (e) => {
      const sliderValue = parseInt(e.target.value);
      scrollSpeed = 0.5 + (sliderValue / 100) * 49.5;
    });
  }

  if (toggleButton) {
    const icon = toggleButton.querySelector("i");
    toggleButton.addEventListener("click", () => {
      if (isScrolling || isScrollingAllowedByUser) {
        stopAutoScroll();
        if (pauseTimeout) {
          clearTimeout(pauseTimeout);
          pauseTimeout = null;
        }
        icon.className = "play-icon";
        isScrollingAllowedByUser = false;
        isUserInteracting = false;
      } else {
        if (!isTableFullScreen) {
          startAutoScroll();
        }
        icon.className = "pause-icon";
        isScrollingAllowedByUser = true;
      }
    });
  }

  if (scrollUpBtn) {
    scrollUpBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (scrollDownBtn) {
    scrollDownBtn.addEventListener("click", () => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
  }

  window.addEventListener("scroll", throttledScrollDirection, { passive: true });
  window.addEventListener("scroll", debouncedUserScroll, { passive: true });
  
  window.addEventListener("wheel", (e) => {
    if (isScrollingAllowedByUser && !isUserInteracting) {
      isUserInteracting = true;
      pauseAutoScrollTemporarily(2000);
      if (userScrollTimeout) clearTimeout(userScrollTimeout);
      userScrollTimeout = setTimeout(() => {
        isUserInteracting = false;
      }, 500);
    }
  }, { passive: true });
}

function setupOutlineFeature() {
  const outlineButton = document.createElement("button");
  outlineButton.textContent = "View Outline";
  outlineButton.id = "generate-outline-button";
  outlineButton.className = "outline-toggle-button";
  
  const controls = getCachedElement("#controls") || document.getElementById("controls");
  controls.appendChild(outlineButton);

  const outlineSidebar = document.createElement("div");
  outlineSidebar.id = "outline-sidebar";
  outlineSidebar.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 70%;
    height: 100%;
    background: #ffffff;
    box-shadow: -4px 0 10px rgba(0,0,0,0.1);
    padding: 1rem;
    overflow-y: auto;
    z-index: 9999;
    display: none;
    font-family: sans-serif;
    scroll-behavior: smooth;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "❌";
  closeBtn.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #ddd;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    font-size: 1rem;
    cursor: pointer;
    color: #666;
    z-index: 10000;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease;
  `;

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 1)';
  });

  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  });

  closeBtn.addEventListener("click", () => {
    outlineSidebar.style.display = "none";
  });

  outlineSidebar.appendChild(closeBtn);
  document.body.appendChild(outlineSidebar);

  const outlineStyles = document.createElement("style");
  outlineStyles.textContent = `
    html {
      scroll-behavior: smooth;
    }
    #outline-sidebar ul {
      list-style: none;
      padding-left: 1rem;
      margin: 0;
      border-left: 2px solid #f8f9fa;
    }
    #outline-sidebar li {
      padding: 4px 0;
      margin-left: 0.5rem;
      font-size: 14px;
      color: #333;
    }
    #outline-sidebar a {
      text-decoration: none;
      color: inherit;
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    #outline-sidebar a:hover {
      background-color: #f3f4f6;
    }
  `;

  const lineStyles = document.createElement("style");
  lineStyles.textContent = `
    .line {
      background-image: repeating-linear-gradient(
        90deg,
        var(--parent-lines-color, #f4f6f8) 0,
        var(--parent-lines-color, #f4f6f8) 1px,
        transparent 1px,
        transparent calc(var(--line-position, 0.2rem) + 1px)
      );
      background-position: left top;
      background-repeat: repeat-y;
      background-attachment: scroll;
    }

    .line.heading {
      background-image: repeating-linear-gradient(
        90deg,
        #e8ebef 0,
        #e8ebef 1px,
        transparent 1px,
        transparent calc(var(--line-position, 0.2rem) + 1px)
      );
    }
  `;
  document.head.appendChild(outlineStyles);

  outlineButton.addEventListener("click", () => {
    outlineSidebar.style.display = "block";
    
    while (outlineSidebar.children.length > 1) {
      outlineSidebar.removeChild(outlineSidebar.lastChild);
    }

    const baseSections = Array.from(document.querySelectorAll('div[id^="section-"]'))
      .filter(sec => loadedSections.has(sec.id) && !sectionChecker.isPyq(sec.id));

    const allHeadings = [];
    baseSections.forEach((section, sIndex) => {
      const headings = section.querySelectorAll(".line.heading, .line.paragraph.heading");
      headings.forEach((heading, hIndex) => {
        const level = parseInt(heading.dataset.level || "0", 10);
        const text = heading.textContent.trim();
        const id = `heading-${sIndex}-${hIndex}`;
        heading.id = id;
        allHeadings.push({ level, text, id });
      });
    });

    if (allHeadings.length === 0) {
      const p = document.createElement("p");
      p.textContent = "No headings found in loaded content.";
      outlineSidebar.appendChild(p);
      return;
    }

    const root = document.createElement("ul");
    const stack = [{ level: 0, element: root }];

    allHeadings.forEach(({ level, text, id }) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${id}`;
      a.textContent = text;
      li.appendChild(a);

      while (stack.length > 1 && level <= stack[stack.length - 1].level) {
        stack.pop();
      }

      let parentUl = stack[stack.length - 1].element;
      if (!parentUl.querySelector("ul")) {
        const newUl = document.createElement("ul");
        parentUl.appendChild(newUl);
        parentUl = newUl;
      } else {
        parentUl = parentUl.querySelector("ul");
      }

      parentUl.appendChild(li);
      stack.push({ level, element: li });
    });

    outlineSidebar.appendChild(root);
  });
}

function setupCacheBuster() {
  const cacheBusterButton = document.createElement('button');
  cacheBusterButton.textContent = "Bust cache";
  cacheBusterButton.id = "bust-cache-button";
  cacheBusterButton.className = "bust-cache-button";
  
  cacheBusterButton.addEventListener('click', function() {
    DOM_CACHE.clear();
    COMPUTATION_CACHE.clear();
    parentLinesCache.clear();
    estimator.reset();
    
    const newCacheBuster = Date.now();
    const url = new URL(window.location);
    url.searchParams.set('bust', newCacheBuster);
    window.location.href = url.toString();
  });

  const controls = getCachedElement("#controls") || document.getElementById("controls");
  controls.appendChild(cacheBusterButton);
}

window.addEventListener('beforeunload', () => {
  DOM_CACHE.clear();
  COMPUTATION_CACHE.clear();
  parentLinesCache.clear();
  
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  if (pauseTimeout) clearTimeout(pauseTimeout);
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }
});

function setupNavigationWarning() {
  let isLeavingPage = false;
  let dialogOpen = false;

  window.history.pushState({ type: 'blocker1' }, '', window.location.href);
  window.history.pushState({ type: 'blocker2' }, '', window.location.href);
  window.history.pushState({ type: 'main' }, '', window.location.href);

  window.addEventListener('popstate', (e) => {
    if (isLeavingPage || dialogOpen) {
      return;
    }

    window.history.pushState({ type: 'blocked' }, '', window.location.href);
    
    dialogOpen = true;
    showNavigationWarningDialog(
      () => {
        dialogOpen = false;
        isLeavingPage = true;
        window.history.back();
      },
      () => {
        dialogOpen = false;
      }
    );
  }, false);

  function showNavigationWarningDialog(onConfirm, onCancel) {
    const existingDialog = document.getElementById('nav-warning-dialog');
    const existingOverlay = document.getElementById('nav-warning-overlay');
    if (existingDialog) existingDialog.remove();
    if (existingOverlay) existingOverlay.remove();

    if (!document.getElementById('nav-warning-styles')) {
      const style = document.createElement('style');
      style.id = 'nav-warning-styles';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideDown {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(20px);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const scrollPos = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollPos}px`;

    const overlay = document.createElement('div');
    overlay.id = 'nav-warning-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      animation: fadeIn 0.2s ease-in;
    `;

    const dialog = document.createElement('div');
    dialog.id = 'nav-warning-dialog';
    dialog.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      max-width: 400px;
      text-align: center;
      animation: slideUp 0.3s ease-out;
    `;

    const heading = document.createElement('h2');
    heading.textContent = 'Leave Page?';
    heading.style.cssText = `
      margin: 0 0 1rem 0;
      font-size: 1.5rem;
      color: #333;
    `;
    dialog.appendChild(heading);

    const message = document.createElement('p');
    message.textContent = 'Are you sure you want to leave this page? Any unsaved progress may be lost.';
    message.style.cssText = `
      margin: 0 0 2rem 0;
      font-size: 1rem;
      color: #666;
      line-height: 1.5;
    `;
    dialog.appendChild(message);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 1rem;
      justify-content: center;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Stay on Page';
    cancelBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      border: 1px solid #ddd;
      background: #f5f5f5;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      transition: all 0.2s ease;
    `;
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#efefef';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = '#f5f5f5';
    });
    cancelBtn.addEventListener('click', closeDialog);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Leave Page';
    confirmBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      border: none;
      background: #dc2626;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      transition: all 0.2s ease;
    `;
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = '#b91c1c';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = '#dc2626';
    });
    confirmBtn.addEventListener('click', () => {
      closeDialog();
      onConfirm();
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(buttonContainer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function closeDialog() {
      overlay.style.animation = 'fadeOut 0.2s ease-out';
      dialog.style.animation = 'slideDown 0.2s ease-out';
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, scrollPos);
        onCancel();
      }, 200);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog();
      }
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }
}

