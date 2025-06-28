// The critical CSS should be in your HTML <head> section, not here
// This JavaScript will only handle the loading overlay creation

// Create loading overlay immediately
const loading = document.createElement("div");
loading.className = "loading-overlay";
loading.innerHTML = `
  <div class="loading-spinner"></div>
  <span>Processing content...</span>
`;
document.body.appendChild(loading);

document.addEventListener("DOMContentLoaded", () => {
  const generateParentLines = (level, color = "#f4f6f8") => {
    if (level <= 1) return "none";
    const shadows = [];
    for (let i = 1; i < level; i++) {
      shadows.push(`${-1.5 * i}rem 0 0 ${color}`);
    }
    return shadows.join(", ");
  };

  // Process each section
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

      // Skip empty lines
      if (!cleanText) return '';

      const paddingLeft = indentLevel * 1.5;
      const linePosition = `${paddingLeft - 0.75}rem`;
      const parentLines = generateParentLines(indentLevel);
      const parentLinesHeading = generateParentLines(indentLevel, "#e8ebef");
      const customStyle =
        indentLevel > 0
          ? `padding-left: ${paddingLeft}rem; --line-position: ${linePosition}; --parent-lines: ${parentLines}; --parent-lines-heading: ${parentLinesHeading};`
          : `padding-left: ${paddingLeft}rem;`;

      if (/<(table|img|div|thead|tbody|tr|td|th)[\s>]/i.test(cleanText)) {
        return `<div class="line paragraph no-marker" data-level="${indentLevel}" style="${customStyle}">${cleanText}</div>`;
      }

      let cssClass = `line`;
      if (indentLevel <= 5) {
        cssClass += ` level-${indentLevel}`;
      } else {
        cssClass += ` level-deep`;
      }

      const nextLine = lines[index + 1] || "";
      const nextIndent = Math.floor((nextLine.replace(/\t/g, "    ").match(/^ */)?.[0].length || 0) / 2);
      const endsWithPunct = /[.:?]$/.test(cleanText);
      const wordCount = cleanText.split(/\s+/).length;
      const charLength = cleanText.length;

      const isLikelyHeading =
        wordCount <= 8 && charLength <= 80 && !endsWithPunct && nextIndent > indentLevel;

      const markerMatch = cleanText.match(/^([-•\d+*]+\.?\s*)(.*)/);
      const hasMarker = markerMatch && markerMatch[1].trim().length > 0;

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
    }).filter(line => line.trim() !== ''); // Remove empty lines

    section.innerHTML = transformed.join("\n");
  });

  // Build the control panel
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

  // Show sections after processing with a smooth transition
  const sectionsToShow = document.querySelectorAll('div[id^="section-"]');
  
  // Override the CSS hiding rule by setting inline styles with !important
  sectionsToShow.forEach((section, index) => {
    // Add a slight delay for each section to create a staggered effect
    setTimeout(() => {
      // Force display block with !important to override CSS
      section.style.setProperty('display', 'block', 'important');
      section.style.opacity = "0";
      section.style.transition = "opacity 0.3s ease-in-out";
      
      // Trigger opacity change after display is set
      requestAnimationFrame(() => {
        section.style.opacity = "1";
      });
    }, index * 50); // 50ms delay between each section
  });

  // Remove loading screen after all sections are processed
  setTimeout(() => {
    loading.style.opacity = "0";
    loading.style.transition = "opacity 0.3s ease-out";
    
    setTimeout(() => {
      loading.remove();
    }, 300);
  }, sectionsToShow.length * 50 + 100);
});