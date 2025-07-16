(function setTitleFromFilename() {
  // If a title is already set and not empty, don't override
  if (document.title && document.title.trim() !== "") return;

  // Else, generate title from filename
  const fileName = window.location.pathname.split("/").pop().split(".")[0];
  const formattedTitle = fileName
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  document.title = formattedTitle;
})();



const loading = document.createElement("div");
loading.className = "loading-overlay";
loading.innerHTML = `
  <div class="loading-spinner"></div>
  <span>Processing content...</span>
`;

// Inject controls at top of body
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

document.getElementById("scrollUp").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("scrollDown").addEventListener("click", () => {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
});


// Helper function to check if an element is inside a table
function isInsideTable(element) {
  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName && parent.tagName.toLowerCase() === 'table') {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

function extractTablesAndContent(htmlString) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;

  const tables = [];
  let tableIndex = 0;

  tempDiv.querySelectorAll('table').forEach((table) => {
    const placeholder = `__TABLE_PLACEHOLDER_${tableIndex++}__`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = table.outerHTML;

    tables.push({
      placeholder,
      content: wrapper.innerHTML
    });

    // Replace the entire table in DOM
    table.replaceWith(placeholder);
  });

  return {
    htmlWithPlaceholders: tempDiv.innerHTML,
    tables
  };
}


// Helper function to restore table elements
function restoreTablesInContent(processedContent, tables) {
  let restored = processedContent;
  tables.forEach(table => {
    restored = restored.replace(table.placeholder, table.content);
  });
  return restored;
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
        
        // Extract tables and replace with placeholders
        const { htmlWithPlaceholders, tables } = extractTablesAndContent(raw);
        
        const lines = htmlWithPlaceholders.split("\n");

        const transformed = lines.map((line, index) => {
          const normalized = line.replace(/\t/g, "    ");
          const leadingSpaces = normalized.match(/^ */)?.[0].length || 0;
          const indentLevel = Math.floor(leadingSpaces / 2);
          const cleanText = normalized.trim();
          if (!cleanText) return '';

          // Check if this line contains a table placeholder
          if (cleanText.includes('__TABLE_PLACEHOLDER_')) {
            // Return the line as-is (it will be restored later)
            return cleanText;
          }

          const paddingLeft = indentLevel * 1.5;
          const linePosition = `${paddingLeft - 0.75}rem`;
          const parentLines = generateParentLines(indentLevel);
          const parentLinesHeading = generateParentLines(indentLevel, "#e8ebef");
          const customStyle = `padding-left: ${paddingLeft}rem; --line-position: ${linePosition}; --parent-lines: ${parentLines}; --parent-lines-heading: ${parentLinesHeading};`;

          // Updated regex to exclude table-related elements
          if (/<(img|div|thead|tbody|tr|td|th)[\s>]/i.test(cleanText)) {
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

        // Restore tables in the transformed content
        const finalContent = restoreTablesInContent(transformed.join("\n"), tables);
        section.innerHTML = finalContent;

        const lineElements = section.querySelectorAll('.line');
        for (let i = 0; i < lineElements.length; i++) {
          const line = lineElements[i];
          const content = line.querySelector('.line-content');
          if (!content) continue;

          const text = content.textContent.trim();
          if (text.startsWith('Answer:')) {
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

            const wrapper = document.createElement('div');
            wrapper.className = 'blurred-block';
            const parent = line.parentElement;
            parent.insertBefore(wrapper, group[0]);
            group.forEach(el => wrapper.appendChild(el));

            const revealHandler = () => {
              wrapper.classList.toggle('revealed');
            };

            wrapper.addEventListener('click', revealHandler);
            wrapper.addEventListener('touchstart', revealHandler);


            i += group.length - 1;
          }
        }

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

      const pageTitle = document.title;
      const h1 = document.createElement("h1");
      h1.textContent = pageTitle;
      h1.style.textAlign = "center";
      h1.style.margin = "2rem 0";

      const firstSection = document.querySelector('div[id^="section-"]');
      if (firstSection) {
        firstSection.parentNode.insertBefore(h1, firstSection);
      }

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

      // Outline button
      const outlineButton = document.createElement("button");
      outlineButton.textContent = "View Outline";
      outlineButton.id = "generate-outline-button";
      outlineButton.className = "outline-toggle-button";
      document.getElementById("controls").appendChild(outlineButton);

      document.getElementById("controls").style.position = "relative";
      document.getElementById("controls").appendChild(outlineButton);

      // Outline sidebar
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

      // Close button
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "❌";
      closeBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 1rem;
        cursor: pointer;
        margin-bottom: 1rem;
        float: right;
        color: #666;
      `;
      closeBtn.addEventListener("click", () => {
        outlineSidebar.style.display = "none";
      });

      outlineSidebar.appendChild(closeBtn);
      document.body.appendChild(outlineSidebar);

      // Outline styles
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

      // Generate outline structure
      outlineButton.addEventListener("click", () => {
        outlineSidebar.style.display = "block";
        const sidebar = outlineSidebar;

        // Remove all children except close button
        while (sidebar.children.length > 1) sidebar.removeChild(sidebar.lastChild);

        const baseSections = Array.from(document.querySelectorAll('div[id^="section-"]'))
          .filter(sec => !/consolidated|pyq/i.test(sec.id));

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
          p.textContent = "No headings found in base content.";
          sidebar.appendChild(p);
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

        sidebar.appendChild(root);
      });


    });
  });


});