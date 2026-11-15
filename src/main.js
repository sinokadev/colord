import { LitElement, html } from 'lit';

function parseHex(hex) {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((character) => character + character).join('');
  }
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function hexToHsl(hex) {
  const { r, g, b } = parseHex(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);
    if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
    else if (max === green) hue = ((blue - red) / delta + 2) / 6;
    else hue = ((red - green) / delta + 4) / 6;
  }

  return { h: hue * 360, s: saturation * 100, l: lightness * 100 };
}

function getContrastTextColor(hex) {
  const { r, g, b } = parseHex(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#111111' : '#FFFFFF';
}

class ColorGrid extends LitElement {
  static properties = {
    colors: { state: true },
    activeColor: { state: true },
    copiedColor: { state: true },
    columns: { state: true },
  };

  constructor() {
    super();
    this.colors = [];
    this.activeColor = '';
    this.copiedColor = '';
    this.columns = 1;
    this.hoverTimer = null;
    this.outsideTimer = null;
    this.copyTimer = null;
    this.edgeSettings = new WeakMap();
    this.handleResize = () => this.updateColumns();
    this.handleMouseLeave = () => {
      clearTimeout(this.hoverTimer);
      clearTimeout(this.outsideTimer);
      this.activeColor = '';
      this.classList.remove('has-active');
      this.outsideTimer = setTimeout(() => {
        this.classList.add('has-active');
      }, 1000);
    };
    this.handleMouseEnter = () => {
      clearTimeout(this.outsideTimer);
      this.classList.remove('has-active');
    };
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.colors = JSON.parse(this.dataset.colors || '[]');
    window.addEventListener('resize', this.handleResize);
    document.documentElement.addEventListener('mouseleave', this.handleMouseLeave);
    document.documentElement.addEventListener('mouseenter', this.handleMouseEnter);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.hoverTimer);
    clearTimeout(this.outsideTimer);
    clearTimeout(this.copyTimer);
    window.removeEventListener('resize', this.handleResize);
    document.documentElement.removeEventListener('mouseleave', this.handleMouseLeave);
    document.documentElement.removeEventListener('mouseenter', this.handleMouseEnter);
  }

  firstUpdated() {
    this.updateColumns();
  }

  updateColumns() {
    const nextColumns = getComputedStyle(this).gridTemplateColumns.trim().split(/\s+/).length;
    if (nextColumns !== this.columns) this.columns = nextColumns;
  }

  getOrderedColors() {
    const sortedColors = this.colors
      .map((item) => ({ ...item, ...hexToHsl(item.color) }))
      .sort((a, b) => {
        if (a.s < 10 && b.s >= 10) return 1;
        if (b.s < 10 && a.s >= 10) return -1;
        if (Math.abs(a.h - b.h) > 8) return a.h - b.h;
        return b.l - a.l;
      });

    const cellIndices = Array.from({ length: this.colors.length }, (_, index) => index)
      .sort((a, b) => {
        const diagonalA = Math.floor(a / this.columns) + (a % this.columns);
        const diagonalB = Math.floor(b / this.columns) + (b % this.columns);
        return diagonalA - diagonalB || a - b;
      });
    const orderedColors = new Array(this.colors.length);
    cellIndices.forEach((cellIndex, colorIndex) => {
      orderedColors[cellIndex] = sortedColors[colorIndex];
    });
    return orderedColors;
  }

  updateEdgeTransform(box) {
    const rect = box.getBoundingClientRect();
    const gridRect = this.getBoundingClientRect();
    const padX = rect.width * 0.3;
    const padY = rect.height * 0.3;
    const hasName = Boolean(box.dataset.name);
    let originX = 'center';
    let tx = 0;
    if (rect.left < padX) {
      originX = 'left';
      tx = 14;
    } else if (window.innerWidth - rect.right < padX) {
      originX = 'right';
      tx = -14;
    }

    let originY = 'center';
    let ty = 0;
    if (rect.top < padY) {
      originY = 'top';
      ty = 14;
    } else if (window.innerHeight - rect.bottom < padY || gridRect.bottom - rect.bottom < padY) {
      originY = 'bottom';
      ty = hasName ? -28 : -14;
    }

    box.dataset.edgeX = originX;
    box.style.transformOrigin = `${originX} ${originY}`;
    box.style.setProperty('--tx', `${tx}px`);
    box.style.setProperty('--ty', `${ty}px`);
  }

  async copyColor(color) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(color);
      return;
    }

    const input = document.createElement('textarea');
    input.value = color;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  handleClick(event, color) {
    if (this.activeColor !== color) return;
    this.copyColor(color).then(() => {
      this.copiedColor = color;
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copiedColor = '';
      }, 900);
    });
  }

  handleMouseOver(event, color) {
    const box = event.currentTarget;
    clearTimeout(this.outsideTimer);
    if (this.activeColor !== color) this.updateEdgeTransform(box);
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => {
      this.activeColor = color;
      this.classList.add('has-active');
    }, 450);
  }

  handleMouseOut(event, color) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    clearTimeout(this.hoverTimer);
    this.activeColor = '';
    this.classList.remove('has-active');
  }

  render() {
    return html`${this.getOrderedColors().map((item) => {
      const active = this.activeColor === item.color;
      return html`
        <div
          class="color-box ${active ? 'is-active' : ''}"
          data-color=${item.color}
          data-name=${item.name || ''}
          style="background-color: ${item.color}; z-index: ${active ? 10 : 1};"
          @click=${(event) => this.handleClick(event, item.color)}
          @mouseover=${(event) => this.handleMouseOver(event, item.color)}
          @mouseout=${(event) => this.handleMouseOut(event, item.color)}
        >
          <span class="color-code" style="color: ${getContrastTextColor(item.color)}">
            ${this.copiedColor === item.color ? 'Copied!' : item.color}
          </span>
          <span class="color-name">${item.name || ''}</span>
        </div>
      `;
    })}`;
  }
}

customElements.define('color-grid', ColorGrid);
