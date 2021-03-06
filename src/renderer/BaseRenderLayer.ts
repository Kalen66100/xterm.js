/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IRenderLayer, IColorSet } from './Interfaces';
import { ITerminal, ITerminalOptions } from '../Interfaces';
import { acquireCharAtlas, CHAR_ATLAS_CELL_SPACING } from './CharAtlas';
import { CharData } from '../Types';
import { CHAR_DATA_WIDTH_INDEX, CHAR_DATA_CHAR_INDEX } from '../Buffer';

export const INVERTED_DEFAULT_COLOR = -1;

export abstract class BaseRenderLayer implements IRenderLayer {
  private _canvas: HTMLCanvasElement;
  protected _ctx: CanvasRenderingContext2D;
  private scaledCharWidth: number;
  private scaledCharHeight: number;
  private scaledLineHeight: number;
  private scaledLineDrawY: number;

  private _charAtlas: HTMLCanvasElement | ImageBitmap;

  constructor(
    container: HTMLElement,
    id: string,
    zIndex: number,
    protected colors: IColorSet
  ) {
    this._canvas = document.createElement('canvas');
    this._canvas.id = `xterm-${id}-layer`;
    this._canvas.style.zIndex = zIndex.toString();
    this._ctx = this._canvas.getContext('2d');
    this._ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    container.appendChild(this._canvas);
  }

  public onOptionsChanged(terminal: ITerminal): void {}
  public onBlur(terminal: ITerminal): void {}
  public onFocus(terminal: ITerminal): void {}
  public onCursorMove(terminal: ITerminal): void {}
  public onGridChanged(terminal: ITerminal, startRow: number, endRow: number): void {}
  public onSelectionChanged(terminal: ITerminal, start: [number, number], end: [number, number]): void {}

  public onThemeChanged(terminal: ITerminal, colorSet: IColorSet): void {
    this._refreshCharAtlas(terminal, colorSet);
  }

  /**
   * Refreshes the char atlas, aquiring a new one if necessary.
   * @param terminal The terminal.
   * @param colorSet The color set to use for the char atlas.
   */
  private _refreshCharAtlas(terminal: ITerminal, colorSet: IColorSet): void {
    this._charAtlas = null;
    const result = acquireCharAtlas(terminal, this.colors, this.scaledCharWidth, this.scaledCharHeight);
    if (result instanceof HTMLCanvasElement) {
      this._charAtlas = result;
    } else {
      result.then(bitmap => this._charAtlas = bitmap);
    }
  }

  public resize(terminal: ITerminal, canvasWidth: number, canvasHeight: number, charSizeChanged: boolean): void {
    // Calculate the scaled character dimensions, if devicePixelRatio is a
    // floating point number then the value is ceiled to ensure there is enough
    // space to draw the character to the cell
    this.scaledCharWidth = Math.ceil(terminal.charMeasure.width * window.devicePixelRatio);
    this.scaledCharHeight = Math.ceil(terminal.charMeasure.height * window.devicePixelRatio);

    // Calculate the scaled line height, if lineHeight is not 1 then the value
    // will be floored because since lineHeight can never be lower then 1, there
    // is a guarentee that the scaled line height will always be larger than
    // scaled char height.
    this.scaledLineHeight = Math.floor(this.scaledCharHeight * terminal.options.lineHeight);

    // Calculate the y coordinate within a cell that text should draw from in
    // order to draw in the center of a cell.
    this.scaledLineDrawY = terminal.options.lineHeight === 1 ? 0 : Math.round((this.scaledLineHeight - this.scaledCharHeight) / 2);

    // Recalcualte the canvas dimensions; width/height define the actual number
    // of pixels in the canvas, style.width/height define the size of the canvas
    // on the page. It's very important that this rounds to nearest integer and
    // not ceils as browsers often set window.devicePixelRatio as something like
    // 1.100000023841858, when it's actually 1.1. Ceiling causes blurriness as
    // the backing canvas image is 1 pixel too large for the canvas element
    // size.
    this._canvas.width = Math.round(canvasWidth * window.devicePixelRatio);
    this._canvas.height = Math.round(canvasHeight * window.devicePixelRatio);
    this._canvas.style.width = `${canvasWidth}px`;
    this._canvas.style.height = `${canvasHeight}px`;

    if (charSizeChanged) {
      this._refreshCharAtlas(terminal, this.colors);
    }
  }

  public abstract reset(terminal: ITerminal): void;

  /**
   * Fills 1+ cells completely. This uses the existing fillStyle on the context.
   * @param x The column to start at.
   * @param y The row to start at
   * @param width The number of columns to fill.
   * @param height The number of rows to fill.
   */
  protected fillCells(x: number, y: number, width: number, height: number): void {
    this._ctx.fillRect(x * this.scaledCharWidth, y * this.scaledLineHeight, width * this.scaledCharWidth, height * this.scaledLineHeight);
  }

  /**
   * Fills a 1px line (2px on HDPI) at the bottom of the cell. This uses the
   * existing fillStyle on the context.
   * @param x The column to fill.
   * @param y The row to fill.
   */
  protected fillBottomLineAtCells(x: number, y: number, width: number = 1): void {
    this._ctx.fillRect(
        x * this.scaledCharWidth,
        (y + 1) * this.scaledLineHeight - window.devicePixelRatio - 1 /* Ensure it's drawn within the cell */,
        width * this.scaledCharWidth,
        window.devicePixelRatio);
  }

  /**
   * Fills a 1px line (2px on HDPI) at the left of the cell. This uses the
   * existing fillStyle on the context.
   * @param x The column to fill.
   * @param y The row to fill.
   */
  protected fillLeftLineAtCell(x: number, y: number): void {
    this._ctx.fillRect(
        x * this.scaledCharWidth,
        y * this.scaledLineHeight,
        window.devicePixelRatio,
        this.scaledLineHeight);
  }

  /**
   * Strokes a 1px rectangle (2px on HDPI) around a cell. This uses the existing
   * strokeStyle on the context.
   * @param x The column to fill.
   * @param y The row to fill.
   */
  protected strokeRectAtCell(x: number, y: number, width: number, height: number): void {
    this._ctx.lineWidth = window.devicePixelRatio;
    this._ctx.strokeRect(
        x * this.scaledCharWidth + window.devicePixelRatio / 2,
        y * this.scaledLineHeight + (window.devicePixelRatio / 2),
        (width * this.scaledCharWidth) - window.devicePixelRatio,
        (height * this.scaledLineHeight) - window.devicePixelRatio);
  }

  /**
   * Clears the entire canvas.
   */
  protected clearAll(): void {
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  /**
   * Clears 1+ cells completely.
   * @param x The column to start at.
   * @param y The row to start at.
   * @param width The number of columns to clear.
   * @param height The number of rows to clear.
   */
  protected clearCells(x: number, y: number, width: number, height: number): void {
    this._ctx.clearRect(x * this.scaledCharWidth, y * this.scaledLineHeight, width * this.scaledCharWidth, height * this.scaledLineHeight);
  }

  /**
   * Draws a truecolor character at the cell. The character will be clipped to
   * ensure that it fits with the cell, including the cell to the right if it's
   * a wide character. This uses the existing fillStyle on the context.
   * @param terminal The terminal.
   * @param charData The char data for the character to draw.
   * @param x The column to draw at.
   * @param y The row to draw at.
   * @param color The color of the character.
   */
  protected fillCharTrueColor(terminal: ITerminal, charData: CharData, x: number, y: number): void {
    this._ctx.font = `${terminal.options.fontSize * window.devicePixelRatio}px ${terminal.options.fontFamily}`;
    this._ctx.textBaseline = 'top';

    // Since uncached characters are not coming off the char atlas with source
    // coordinates, it means that text drawn to the canvas (particularly '_')
    // can bleed into other cells. This code will clip the following fillText,
    // ensuring that its contents don't go beyond the cell bounds.
    this._ctx.beginPath();
    this._ctx.rect(x * this.scaledCharWidth, y * this.scaledLineHeight + this.scaledLineDrawY, charData[CHAR_DATA_WIDTH_INDEX] * this.scaledCharWidth, this.scaledCharHeight);
    this._ctx.clip();
    this._ctx.fillText(charData[CHAR_DATA_CHAR_INDEX], x * this.scaledCharWidth, y * this.scaledCharHeight);
  }

  /**
   * Draws a character at a cell. If possible this will draw using the character
   * atlas to reduce draw time.
   * @param terminal The terminal.
   * @param char The character.
   * @param code The character code.
   * @param width The width of the character.
   * @param x The column to draw at.
   * @param y The row to draw at.
   * @param fg The foreground color, in the format stored within the attributes.
   * @param bold Whether the text is bold.
   */
  protected drawChar(terminal: ITerminal, char: string, code: number, width: number, x: number, y: number, fg: number, bold: boolean): void {
    // Clear the cell next to this character if it's wide
    if (width === 2) {
      this.clearCells(x + 1, y, 1, 1);
    }

    let colorIndex = 0;
    if (fg < 256) {
      colorIndex = fg + 2;
    } else {
      // If default color and bold
      if (bold) {
        colorIndex = 1;
      }
    }
    const isAscii = code < 256;
    const isBasicColor = (colorIndex > 1 && fg < 16);
    const isDefaultColor = fg >= 256;
    if (isAscii && (isBasicColor || isDefaultColor)) {
      // ImageBitmap's draw about twice as fast as from a canvas
      const charAtlasCellWidth = this.scaledCharWidth + CHAR_ATLAS_CELL_SPACING;
      const charAtlasCellHeight = this.scaledCharHeight + CHAR_ATLAS_CELL_SPACING;
      this._ctx.drawImage(this._charAtlas,
          code * charAtlasCellWidth, colorIndex * charAtlasCellHeight, this.scaledCharWidth, this.scaledCharHeight,
          x * this.scaledCharWidth, y * this.scaledLineHeight + this.scaledLineDrawY, this.scaledCharWidth, this.scaledCharHeight);
    } else {
      this._drawUncachedChar(terminal, char, width, fg, x, y);
    }
    // This draws the atlas (for debugging purposes)
    // this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    // this._ctx.drawImage(this._charAtlas, 0, 0);
  }

  /**
   * Draws a character at a cell. The character will be clipped to
   * ensure that it fits with the cell, including the cell to the right if it's
   * a wide character.
   * @param terminal The terminal.
   * @param char The character.
   * @param width The width of the character.
   * @param fg The foreground color, in the format stored within the attributes.
   * @param x The column to draw at.
   * @param y The row to draw at.
   */
  private _drawUncachedChar(terminal: ITerminal, char: string, width: number, fg: number, x: number, y: number): void {
    this._ctx.save();
    this._ctx.font = `${terminal.options.fontSize * window.devicePixelRatio}px ${terminal.options.fontFamily}`;
    this._ctx.textBaseline = 'top';

    if (fg === INVERTED_DEFAULT_COLOR) {
      this._ctx.fillStyle = this.colors.background;
    } else if (fg < 256) {
      // 256 color support
      this._ctx.fillStyle = this.colors.ansi[fg];
    } else {
      this._ctx.fillStyle = this.colors.foreground;
    }

    // Since uncached characters are not coming off the char atlas with source
    // coordinates, it means that text drawn to the canvas (particularly '_')
    // can bleed into other cells. This code will clip the following fillText,
    // ensuring that its contents don't go beyond the cell bounds.
    this._ctx.beginPath();
    this._ctx.rect(x * this.scaledCharWidth, y * this.scaledLineHeight + this.scaledLineDrawY, width * this.scaledCharWidth, this.scaledCharHeight);
    this._ctx.clip();

    // Draw the character
    this._ctx.fillText(char, x * this.scaledCharWidth, y * this.scaledLineHeight + this.scaledLineDrawY);
    this._ctx.restore();
  }
}

