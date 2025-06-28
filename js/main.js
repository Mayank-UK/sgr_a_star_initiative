// Create loading overlay immediately
const loading = document.createElement("div");
loading.className = "loading-overlay";
loading.innerHTML = `
  <div class="loading-spinner"></div>
  <span>Processing content...</span>
`;
document.body.appendChild(loading);

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
          const wordCount = cleanText.split(/\s+/).length;
          const charLength = cleanText.length;

          const markerMatch = cleanText.match(/^([-•\d+a-zA-Z]+[).\-:]?\s+)(.*)/);
          const hasMarker = markerMatch && markerMatch[1].trim().length > 0;

          // Improved heading detection logic
          const hasChildren = nextIndent > indentLevel;
          const shortEnough = charLength <= 100 && wordCount <= 12;
          const endsWithColon = cleanText.endsWith(":");
          const isLikelyHeading = shortEnough && hasChildren && (!endsWithPunct || endsWithColon);

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

        setTimeout(() => {
          loading.remove();
        }, 300);
      }, sectionsToShow.length * 50 + 100);
    });
  });
});
