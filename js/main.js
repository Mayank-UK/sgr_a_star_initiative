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
  <button id="toggleScroll">
      <i class="play-icon"></i>
  </button>
  <input type="range" id="speedRange" min="1" max="100" value="5">
  <button id="scrollUp" title="Scroll Up">
    <i class="scroll-up-icon"></i>
  </button>
  <button id="scrollDown" title="Scroll Down">
    <i class="scroll-down-icon"></i>
  </button>
`;

document.body.prepend(scrollControlsDiv);
document.body.prepend(controlsDiv);
document.body.appendChild(loading);

// Optimized variables
let scrollSpeed = 3;
let isScrolling = false;
let isScrollingAllowedByUser = false;
let lastScrollY = window.scrollY;
let animationId = null;
let pauseTimeout = null;
let isUserInteracting = false;
let scrollControls = null;
let lastAutoScrollY = 0;
let userScrollTimeout = null;
let accumulatedPixels = 0; // Essential for smooth scrolling
let isTableFullScreen = false;
let wasScrollingBeforeFullScreen = false;
let loadedSections = new Set();
let isProcessingSection = false;
let lastFrameTime = 0;
let scrollTimeout; // Add missing scrollTimeout variable

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
  if (deltaTime < 16.67) { // Cap at 60 FPS
    animationId = requestAnimationFrame(optimizedSmoothScroll);
    return;
  }
  
  lastFrameTime = currentTime;
  
  // Use original pixel accumulation method for smooth, readable speed
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
    accumulatedPixels = 0; // Reset accumulated pixels
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
  accumulatedPixels = 0; // Reset accumulated pixels
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

// Optimized scroll handlers with throttling
const throttledScrollDirection = throttle(() => {
  const currentY = window.scrollY;
  const goingUp = currentY < lastScrollY;
  
  if (scrollControls) {
    if (goingUp) {
      scrollControls.style.opacity = "1";
      scrollControls.style.pointerEvents = "auto";
    } else {
      if ('ontouchstart' in window) {
        scrollControls.style.opacity = "1";
        scrollControls.style.pointerEvents = "auto";
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          if (!goingUp) {
            scrollControls.style.opacity = "0";
            scrollControls.style.pointerEvents = "none";
          }
        }, 3000);
      } else {
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

  // Cache expensive computations
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

// Optimized section processing
function processSection(section) {
  if (loadedSections.has(section.id)) return;

  const raw = section.innerHTML.trim();
  const { htmlWithPlaceholders, tables } = extractTablesAndContentOptimized(raw);
  const lines = htmlWithPlaceholders.split("\n");

  // Use document fragment for batch DOM operations
  const fragment = document.createDocumentFragment();
  
  const transformedLines = [];
  
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineData = optimizedProcessLine(line, index, lines);
    
    if (lineData.empty) continue;

    const { indentLevel, cleanText } = lineData;
    const paddingLeft = indentLevel * 1;
    const linePosition = `${paddingLeft + 0.2}rem`;
    const parentLines = generateParentLines(indentLevel);
    const parentLinesHeading = generateParentLines(indentLevel, "#e8ebef");
    const customStyle = `padding-left: ${paddingLeft}rem; --line-position: ${linePosition}; --parent-lines: ${parentLines}; --parent-lines-heading: ${parentLinesHeading};`;

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

  const finalContent = restoreTablesInContent(transformedLines.join("\n"), tables);
  section.innerHTML = finalContent;

  // Process answer blocks efficiently
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

    // Collect answer group
    for (let j = i + 1; j < lineElements.length; j++) {
      const next = lineElements[j];
      const nextLevel = parseInt(next.dataset.level || '0', 10);
      if (nextLevel <= baseLevel) break;
      group.push(next);
    }

    // Check for analysis section
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

// Optimized blurred block creation
function createBlurredBlock(group) {
  const wrapper = document.createElement('div');
  wrapper.className = 'blurred-block';
  wrapper.dataset.optimized = 'true'; // Mark for event delegation
  
  const parent = group[0].parentElement;
  parent.insertBefore(wrapper, group[0]);
  
  // Use document fragment for batch insertion
  const fragment = document.createDocumentFragment();
  group.forEach(el => fragment.appendChild(el));
  wrapper.appendChild(fragment);
}

// Event delegation for better performance
function setupEventDelegation() {
  // Single click handler for all interactions
  document.addEventListener('click', (e) => {
    // Handle blurred blocks
    if (e.target.closest('.blurred-block[data-optimized]')) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = e.target.closest('.blurred-block');
      wrapper.classList.toggle('revealed');
      return;
    }
    
    // Handle table expansion
    if (e.target.classList.contains('table-expand-icon')) {
      const container = e.target.closest('.table-container');
      if (container) {
        toggleFullScreenTable(container);
      }
      return;
    }
  });

  // Single touch handler for mobile
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

    // Handle user scroll interaction
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
  }, { passive: false });
}

// Intersection Observer for even more efficient lazy loading
const intersectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const section = entry.target;
      if (!loadedSections.has(section.id) && section.style.display !== 'none') {
        processSection(section);
        intersectionObserver.unobserve(section); // Stop observing once loaded
      }
    }
  });
}, {
  rootMargin: '50px' // Load 50px before coming into view
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

      // Setup event delegation early
      setupEventDelegation();

      // Find priority sections
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

      // Setup controls with optimized logic
      const controls = getCachedElement("#controls") || document.getElementById("controls");
      if (controls) {
        const sectionDivs = document.querySelectorAll('div[id^="section-"]');
        const hasConsolidatedSection = consolidatedSection !== undefined;
        
        // Use document fragment for batch control creation
        const controlsFragment = document.createDocumentFragment();
        
        sectionDivs.forEach((section) => {
          const sectionId = section.id;
          const labelText = sectionId.replace("section-", "");
          const isConsolidated = sectionChecker.isConsolidated(sectionId);
          const isBase = sectionChecker.isBase(sectionId);
          const shouldBeChecked = isConsolidated || (!hasConsolidatedSection && isBase);

          const wrapper = createSectionToggle(section, sectionId, labelText, shouldBeChecked);
          controlsFragment.appendChild(wrapper);

          // Setup intersection observer for unloaded sections
          if (!shouldBeChecked) {
            intersectionObserver.observe(section);
          }
        });
        
        controls.appendChild(controlsFragment);
      }

      // Optimized section display logic
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

      // Faster loading completion
      setTimeout(() => {
        loading.style.opacity = "0";
        loading.style.transition = "opacity 0.3s ease-out";
        setTimeout(() => loading.remove(), 300);
      }, visibleSectionCount * 50 + 100);

      // Add title
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
        }, 300);
      } else {
        targetSection.style.transition = "opacity 0.2s ease-out";  
        targetSection.style.opacity = "0";
        setTimeout(() => {
          targetSection.style.display = "none";
          switchLoading.remove();
          checkbox.disabled = false;
          isProcessingSection = false;
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

  // Setup optimized scroll event listeners
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
    width: 36%;
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
  document.head.appendChild(outlineStyles);

  outlineButton.addEventListener("click", () => {
    outlineSidebar.style.display = "block";
    
    // Clear previous outline
    while (outlineSidebar.children.length > 1) {
      outlineSidebar.removeChild(outlineSidebar.lastChild);
    }

    // Only process loaded sections for outline (performance optimization)
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
    // Clear all caches before reload for fresh start
    DOM_CACHE.clear();
    COMPUTATION_CACHE.clear();
    parentLinesCache.clear();
    
    const newCacheBuster = Date.now();
    const url = new URL(window.location);
    url.searchParams.set('bust', newCacheBuster);
    window.location.href = url.toString();
  });

  const controls = getCachedElement("#controls") || document.getElementById("controls");
  controls.appendChild(cacheBusterButton);
}

// Memory cleanup on page unload
window.addEventListener('beforeunload', () => {
  // Clear all caches to prevent memory leaks
  DOM_CACHE.clear();
  COMPUTATION_CACHE.clear();
  parentLinesCache.clear();
  
  // Cancel any ongoing animations
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  // Clear timeouts
  if (pauseTimeout) clearTimeout(pauseTimeout);
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  
  // Disconnect observer
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }
});



function setupNavigationWarning() {
  let isLeavingPage = false;
  let dialogOpen = false;

  // Push multiple states to create a deep history stack
  // This prevents accidental back navigation when first arriving
  window.history.pushState({ type: 'blocker1' }, '', window.location.href);
  window.history.pushState({ type: 'blocker2' }, '', window.location.href);
  window.history.pushState({ type: 'main' }, '', window.location.href);

  // Only intercept popstate (back button)
  window.addEventListener('popstate', (e) => {
    // Don't show dialog if we're already leaving
    if (isLeavingPage || dialogOpen) {
      return;
    }

    // Push state back to prevent actual navigation
    window.history.pushState({ type: 'blocked' }, '', window.location.href);
    
    dialogOpen = true;
    showNavigationWarningDialog(
      () => {
        // User clicked "Leave Page"
        dialogOpen = false;
        isLeavingPage = true;
        window.history.back();
      },
      () => {
        // User clicked "Stay on Page"
        dialogOpen = false;
      }
    );
  }, false);



  // Function to create and show the warning dialog
  function showNavigationWarningDialog(onConfirm, onCancel) {
    // Remove any existing dialogs
    const existingDialog = document.getElementById('nav-warning-dialog');
    const existingOverlay = document.getElementById('nav-warning-overlay');
    if (existingDialog) existingDialog.remove();
    if (existingOverlay) existingOverlay.remove();

    // Add animations style if not already added
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

    // Save scroll position and disable scrolling
    const scrollPos = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollPos}px`;

    // Create overlay
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

    // Create dialog
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

    // Add heading
    const heading = document.createElement('h2');
    heading.textContent = 'Leave Page?';
    heading.style.cssText = `
      margin: 0 0 1rem 0;
      font-size: 1.5rem;
      color: #333;
    `;
    dialog.appendChild(heading);

    // Add message
    const message = document.createElement('p');
    message.textContent = 'Are you sure you want to leave this page? Any unsaved progress may be lost.';
    message.style.cssText = `
      margin: 0 0 2rem 0;
      font-size: 1rem;
      color: #666;
      line-height: 1.5;
    `;
    dialog.appendChild(message);

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 1rem;
      justify-content: center;
    `;

    // Cancel button
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

    // Confirm button
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

    // Close dialog function
    function closeDialog() {
      overlay.style.animation = 'fadeOut 0.2s ease-out';
      dialog.style.animation = 'slideDown 0.2s ease-out';
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
        // Restore scroll position and scrolling
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, scrollPos);
        onCancel();
      }, 200);
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }
}
