const loading = document.createElement("div");
loading.className = "loading-overlay";
loading.innerHTML = `
  <div class="loading-spinner"></div>
  <span>Processing content...</span>
`;
document.body.appendChild(loading);

// Autoscroll Variables
let scrollSpeed = 3; // Default speed in pixels per second
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

// Smooth scroll logic with pixel accumulation
function smoothScroll() {
  if (!isScrolling) {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    accumulatedPixels = 0; // Reset accumulation when stopping
    return;
  }

  // Use a fixed time step for consistent movement
  const pixelsPerFrame = scrollSpeed / 60; // Assuming 60fps
  accumulatedPixels += pixelsPerFrame;

  // Only scroll when accumulated pixels are enough
  if (accumulatedPixels >= 1) {
    const scrollAmount = Math.floor(accumulatedPixels);
    window.scrollBy({
      top: scrollAmount,
      behavior: 'instant'
    });
    accumulatedPixels -= scrollAmount; // Keep the fractional remainder
    lastAutoScrollY = window.scrollY; // Update last auto-scroll position
  }

  const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 1;
  if (!atBottom) {
    animationId = requestAnimationFrame(smoothScroll);
  } else {
    isScrolling = false;
    animationId = null;
    accumulatedPixels = 0;
  }
}

function startAutoScroll() {
  if (!isScrolling) {
    isScrolling = true;
    animationId = requestAnimationFrame(smoothScroll);
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
    if (isScrollingAllowedByUser) {
      startAutoScroll();
    }
  }, ms);
}

function handleScrollDirection() {
  const currentY = window.scrollY;
  const goingUp = currentY < lastScrollY;
  if (scrollControls) {
    scrollControls.style.opacity = goingUp ? "1" : "0";
    scrollControls.style.pointerEvents = goingUp ? "auto" : "none";
  }
  lastScrollY = currentY;
}

function handleUserScroll() {
  if (isScrollingAllowedByUser && !isUserInteracting) {
    const currentY = window.scrollY;
    if (Math.abs(currentY - lastAutoScrollY) > 50 || currentY < lastAutoScrollY - 10) {
      isUserInteracting = true;
      pauseAutoScrollTemporarily(2000);
      
      if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
      }
      
      userScrollTimeout = setTimeout(() => {
        isUserInteracting = false;
      }, 500);
    }
  }
  
  if (!isScrolling) {
    lastAutoScrollY = window.scrollY;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const generateParentLines = (level, color = "#f4f6f8") => {
        if (level <= 1) return "none";
        const shadows = [];
        for (let i = 1; i < level; i++) {
          shadows.push(`${-1.5 * i}rem 0 0 ${color}`);
        }
        return shadows.join(", ");
      };

      const sections = document.querySelectorAll('div[id^="section-"]');
      if (sections.length === 0) {
        console.warn("No sections found with id starting with 'section-'");
        loading.remove();
        return;
      }

      sections.forEach((section) => {
        const raw = section.innerHTML.trim();
        const lines = raw.split("\n");

        const transformed = lines.map((line, index) => {
          const normalized = line.replace(/\t/g, "    ");
          const leadingSpaces = normalized.match(/^ */)?.[0].length || 0;
          const indentLevel = Math.floor(leadingSpaces / 2);
          const cleanText = normalized.trim();
          if (!cleanText) return '';

          const paddingLeft = indentLevel * 1.5;
          const linePosition = `${paddingLeft - 0.75}rem`;
          const parentLines = generateParentLines(indentLevel);
          const parentLinesHeading = generateParentLines(indentLevel, "#e8ebef");
          const customStyle = `padding-left: ${paddingLeft}rem; --line-position: ${linePosition}; --parent-lines: ${parentLines}; --parent-lines-heading: ${parentLinesHeading};`;

          if (/<(table|img|div|thead|tbody|tr|td|th)[\s>]/i.test(cleanText)) {
            return `<div class="line paragraph no-marker" data-level="${indentLevel}" style="${customStyle}">${cleanText}</div>`;
          }

          let cssClass = `line`;
          cssClass += indentLevel <= 5 ? ` level-${indentLevel}` : ` level-deep`;

          const nextLine = lines[index + 1] || "";
          const nextIndent = Math.floor((nextLine.replace(/\t/g, "    ").match(/^ */)?.[0].length || 0) / 2);
          const endsWithPunct = /[.:?]$/.test(cleanText);
          const endsWithQuestion = cleanText.endsWith("?");
          const wordCount = cleanText.split(/\s+/).length;
          const charLength = cleanText.length;

          const markerMatch = cleanText.match(/^([-•\d+a-zA-Z]+[).\-:]?\s+)(.*)/);
          const hasMarker = markerMatch && markerMatch[1].trim().length > 0;

          const hasChildren = nextIndent > indentLevel;
          const shortEnough = charLength <= 100 && wordCount <= 12;
          const endsWithColon = cleanText.endsWith(":");
          const isLikelyHeading = shortEnough && hasChildren && (!endsWithPunct || endsWithColon || endsWithQuestion);

          if (hasMarker) cssClass += " bullet";
          if (isLikelyHeading) cssClass += " heading";
          else cssClass += " paragraph";

          if (hasMarker) {
            const marker = markerMatch[1];
            const content = markerMatch[2];
            return `
              <div class="${cssClass}" data-level="${indentLevel}" style="${customStyle}">
                <span class="line-marker">${marker}</span>
                <span class="line-content">${content}</span>
              </div>
            `;
          } else {
            cssClass += " no-marker";
            return `
              <div class="${cssClass}" data-level="${indentLevel}" style="${customStyle}">
                <span class="line-content">${cleanText}</span>
              </div>
            `;
          }
        }).filter(line => line.trim() !== '');

        section.innerHTML = transformed.join("\n");
      });

      const controls = document.getElementById("controls");
      if (controls) {
        const sectionDivs = document.querySelectorAll('div[id^="section-"]');
        sectionDivs.forEach((section) => {
          const sectionId = section.id;
          const labelText = sectionId.replace("section-", "");

          const label = document.createElement("label");
          label.classList.add("switch-label");

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = true;
          checkbox.addEventListener("change", () => {
            section.style.display = checkbox.checked ? "block" : "none";
          });

          const slider = document.createElement("span");
          slider.classList.add("slider");

          label.appendChild(checkbox);
          label.appendChild(slider);

          const text = document.createElement("span");
          text.textContent = ` ${labelText}`;

          const wrapper = document.createElement("div");
          wrapper.classList.add("switch-wrapper");
          wrapper.appendChild(label);
          wrapper.appendChild(text);

          controls.appendChild(wrapper);
        });
      }

      const sectionsToShow = document.querySelectorAll('div[id^="section-"]');
      sectionsToShow.forEach((section, index) => {
        setTimeout(() => {
          section.style.setProperty('display', 'block', 'important');
          section.style.opacity = "0";
          section.style.transition = "opacity 0.3s ease-in-out";
          requestAnimationFrame(() => {
            section.style.opacity = "1";
          });
        }, index * 50);
      });

      setTimeout(() => {
        loading.style.opacity = "0";
        loading.style.transition = "opacity 0.3s ease-out";
        setTimeout(() => loading.remove(), 300);
      }, sectionsToShow.length * 50 + 100);

      // Scroll controls
      scrollControls = document.getElementById("scroll-controls");

      const speedRange = document.getElementById("speedRange");
      const toggleButton = document.getElementById("toggleScroll");
      const icon = toggleButton.querySelector("i");

      if (speedRange) {
        speedRange.min = "1";
        speedRange.max = "100";
        speedRange.value = "10"; // Default to a slow speed
        speedRange.addEventListener("input", (e) => {
          const sliderValue = parseInt(e.target.value);
          scrollSpeed = 0.5 + (sliderValue / 100) * 49.5; // Maps 1-100 to 0.5-50 pixels/second
        });
      }

      if (toggleButton) {
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
            startAutoScroll();
            icon.className = "pause-icon";
            isScrollingAllowedByUser = true;
          }
        });
      }

      window.addEventListener("scroll", handleScrollDirection, { passive: true });
      window.addEventListener("scroll", handleUserScroll, { passive: true });
      
      window.addEventListener("wheel", (e) => {
        if (isScrollingAllowedByUser && !isUserInteracting) {
          isUserInteracting = true;
          pauseAutoScrollTemporarily(2000);
          
          if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
          }
          
          userScrollTimeout = setTimeout(() => {
            isUserInteracting = false;
          }, 500);
        }
      }, { passive: true });
      
      window.addEventListener("touchstart", (e) => {
        if (isScrollingAllowedByUser && !isUserInteracting) {
          isUserInteracting = true;
          pauseAutoScrollTemporarily(2000);
          
          if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
          }
          
          userScrollTimeout = setTimeout(() => {
            isUserInteracting = false;
          }, 500);
        }
      }, { passive: true });
    });
  });
});