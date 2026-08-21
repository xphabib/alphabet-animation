const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { spawn } = require("child_process");

const ASSETS_DIR = path.join(__dirname, "assets");

const OUTPUT_DIR = path.join(__dirname, "outputs");
const BACKGROUND_FILE = path.join(__dirname, "background.jpg");
const CONTROLS_DIR = path.join(__dirname, "controls");
const CROSS_ICON_FILE = path.join(CONTROLS_DIR, "cross.png");
const CHECK_ICON_FILE = path.join(CONTROLS_DIR, "check.png");
const ANIMATING_MP3 = path.join(CONTROLS_DIR, "animating.mp3");
const WRONG_MP3 = path.join(CONTROLS_DIR, "wrong.mp3");
const CORRECT_MP3 = path.join(CONTROLS_DIR, "correct.mp3");

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

const SLIDE_IN_DURATION = 2.0;
const PAUSE_DURATION = 0.8;
const MOVE_DOWN_DURATION = 1.5;
const MATCH_PAUSE = 1.2;
const OUTRO_DURATION = 3.5;

const LETTER_X = 100;
const LETTER_SPACING = 40;
const VERTICAL_PADDING = 100;
const ICON_SIZE = 360;


// ==================================================
// Load A-Z assets
// ==================================================

async function loadAlphabetAssets() {
  if (!fs.existsSync(BACKGROUND_FILE)) {
    throw new Error(
        `Missing background asset: ${BACKGROUND_FILE}`
    );
  }

  if (!fs.existsSync(CROSS_ICON_FILE)) {
    throw new Error(
        `Missing cross icon asset: ${CROSS_ICON_FILE}`
    );
  }

  if (!fs.existsSync(CHECK_ICON_FILE)) {
    throw new Error(
        `Missing check icon asset: ${CHECK_ICON_FILE}`
    );
  }

  const alphabet = {};

  for (const letter of "abcdefghijklmnopqrstuvwxyz") {
    const filePath = path.join(
        ASSETS_DIR,
        `${letter}.png`
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(
          `Missing alphabet asset: ${filePath}`
      );
    }

    const metadata =
        await sharp(filePath).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(
          `Invalid image: ${filePath}`
      );
    }

    alphabet[letter] = {
      path: filePath,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };

    console.log(
        `Loaded ${letter}.png → ` +
        `${metadata.width}x${metadata.height}`
    );
  }

  return alphabet;
}


const INPUTS_DIR = path.join(__dirname, "inputs");

// ==================================================
// Load words
// ==================================================

function loadWords() {
  if (!fs.existsSync(INPUTS_DIR)) {
    throw new Error(`Inputs directory not found: ${INPUTS_DIR}`);
  }

  return fs
      .readdirSync(INPUTS_DIR)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".png", ".jpg", ".jpeg"].includes(ext);
      })
      .map((file) => path.basename(file, path.extname(file)).trim().toLowerCase())
      .filter(Boolean);
}


// ==================================================
// Validate word
// ==================================================

function validateWord(word, alphabet) {
  if (!/^[a-z]+$/.test(word)) {
    throw new Error(
        `Invalid word "${word}". Only a-z is allowed.`
    );
  }

  for (const character of word) {
    if (!alphabet[character]) {
      throw new Error(
          `Missing asset: ${character}.png`
      );
    }
  }
}


// ==================================================
// Prepare letters
// ==================================================

async function prepareLetterHalves(
    word,
    alphabet,
    tempDir
) {
  const letters = [];

  // ----------------------------------------------
  // Get original dimensions
  // ----------------------------------------------

  for (const character of word) {
    const asset = alphabet[character];

    letters.push({
      character,
      path: asset.path,
      width: asset.width,
      height: asset.height,
    });
  }


  // ----------------------------------------------
  // Calculate fixed height for consistency
  // ----------------------------------------------

  const availableHeight = HEIGHT - VERTICAL_PADDING * 2;
  
  let maxLetterHeight = availableHeight;
  if (letters.length > 1) {
    maxLetterHeight = (availableHeight - (letters.length - 1) * LETTER_SPACING) / letters.length;
  }
  
  const fixedHeight = Math.min(maxLetterHeight, 350); // 350 is a good uniform max size

  let scaledTotalHeight = letters.length * fixedHeight;
  if (letters.length > 1) {
    scaledTotalHeight += (letters.length - 1) * LETTER_SPACING;
  }


  // ----------------------------------------------
  // Vertical centering
  // ----------------------------------------------

  let currentY =
      (HEIGHT - scaledTotalHeight) / 2;

  let maxWidth = 0;
  for (const item of letters) {
    const letterScale = fixedHeight / item.height;
    const scaledWidth = Math.max(1, Math.round(item.width * letterScale));
    if (scaledWidth > maxWidth) maxWidth = scaledWidth;
  }

  const inputs = [];


  // ----------------------------------------------
  // Generate each letter
  // ----------------------------------------------

  for (
      let index = 0;
      index < letters.length;
      index++
  ) {
    const item = letters[index];

    const letterScale = fixedHeight / item.height;

    const scaledWidth =
        Math.max(
            1,
            Math.round(
                item.width * letterScale
            )
        );

    const scaledHeight =
        Math.max(
            1,
            Math.round(
                fixedHeight
            )
        );


    // --------------------------------------------
    // Resize
    // --------------------------------------------

    const resizedPath =
        path.join(
            tempDir,
            `${index}_resized.png`
        );

    await sharp(item.path)
        .resize(
            scaledWidth,
            scaledHeight
        )
        .png()
        .toFile(resizedPath);


    // --------------------------------------------
    // Split position
    // --------------------------------------------

    const halfWidth =
        Math.floor(
            scaledWidth / 2
        );

    const leftWidth =
        halfWidth;

    const rightWidth =
        scaledWidth - halfWidth;


    if (
        leftWidth <= 0 ||
        rightWidth <= 0
    ) {
      throw new Error(
          `Letter "${item.character}" became too small after scaling.`
      );
    }


    // --------------------------------------------
    // Paths
    // --------------------------------------------

    const leftPath =
        path.join(
            tempDir,
            `${index}_left.png`
        );

    const rightPath =
        path.join(
            tempDir,
            `${index}_right.png`
        );


    // --------------------------------------------
    // LEFT
    // --------------------------------------------

    await sharp(resizedPath)
        .extract({
          left: 0,
          top: 0,
          width: leftWidth,
          height: scaledHeight,
        })
        .png()
        .toFile(leftPath);


    // --------------------------------------------
    // RIGHT
    // --------------------------------------------

    await sharp(resizedPath)
        .extract({
          left: halfWidth,
          top: 0,
          width: rightWidth,
          height: scaledHeight,
        })
        .png()
        .toFile(rightPath);


    // --------------------------------------------
    // Store data
    // --------------------------------------------

    inputs.push({
      character: item.character,

      leftPath,
      rightPath,

      x: Math.round(LETTER_X + (maxWidth - scaledWidth) / 2),

      y: Math.round(currentY),

      width: scaledWidth,
      height: scaledHeight,

      halfWidth,
      rightWidth,
    });


    // --------------------------------------------
    // Next letter
    // --------------------------------------------

    currentY +=
        scaledHeight +
        LETTER_SPACING;
  }


  // ----------------------------------------------
  // Prepare resized control icons
  // ----------------------------------------------

  const crossPath =
      path.join(
          tempDir,
          "control_cross.png"
      );

  const checkPath =
      path.join(
          tempDir,
          "control_check.png"
      );

  await sharp(CROSS_ICON_FILE)
      .resize(
          ICON_SIZE,
          ICON_SIZE,
          {
            fit: "contain",
            background: {
              r: 0,
              g: 0,
              b: 0,
              alpha: 0,
            },
          }
      )
      .png()
      .toFile(crossPath);

  await sharp(CHECK_ICON_FILE)
      .resize(
          ICON_SIZE,
          ICON_SIZE,
          {
            fit: "contain",
            background: {
              r: 0,
              g: 0,
              b: 0,
              alpha: 0,
            },
          }
      )
      .png()
      .toFile(checkPath);


  // ----------------------------------------------
  // Final full word image
  // ----------------------------------------------
  let finalImagePath = null;
  const inputFiles = fs.readdirSync(INPUTS_DIR);
  for (const file of inputFiles) {
    const base = path.basename(file, path.extname(file));
    if (base.toLowerCase() === word) {
      const ext = path.extname(file).toLowerCase();
      if ([".png", ".jpg", ".jpeg"].includes(ext)) {
        finalImagePath = path.join(INPUTS_DIR, file);
        break;
      }
    }
  }
  let finalImageInfo = null;
  
  if (finalImagePath) {
    const resizedFinalPath = path.join(tempDir, "final_image.png");
    const resizedFinal = await sharp(finalImagePath)
      .resize(500, 500, { fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });

    await sharp(resizedFinal.data).toFile(resizedFinalPath);

    finalImageInfo = {
      path: resizedFinalPath,
      width: resizedFinal.info.width,
      height: resizedFinal.info.height,
      x: WIDTH - resizedFinal.info.width - 100, // right side with 100px padding
      y: (HEIGHT - resizedFinal.info.height) / 2 // vertical middle
    };

    // Big check icon above the final image
    const bigCheckPath = path.join(tempDir, "big_check.png");
    await sharp(CHECK_ICON_FILE)
      .resize(400, 400, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(bigCheckPath);

    finalImageInfo.bigCheck = {
      path: bigCheckPath,
      width: 400,
      height: 400,
      x: finalImageInfo.x + (finalImageInfo.width - 400) / 2,
      y: finalImageInfo.y - 400 - 20
    };
  }

  return {
    inputs,
    crossPath,
    checkPath,
    finalImageInfo
  };
}


// ==================================================
// Build FFmpeg filter
// ==================================================

// ==================================================
// Calculate Animation Timeline
// ==================================================

function calculateTimeline(inputs) {
  let currentTime = 0.2;
  const pieces = [];
  const indicators = [];
  const animatingSegments = [];

  const startX = WIDTH + 100;
  const slot0X = inputs[0].x + inputs[0].halfWidth;
  const slot0Y = inputs[0].y;

  // Animate starting from the last alphabet to the first
  for (let i = inputs.length - 1; i >= 0; i--) {
    const targetSlot = i;
    const segments = [];
    const pieceStartTime = currentTime;

    // 1. Initial fly-in to slot 0 from top right
    const t0_start = currentTime;
    const t0_end = t0_start + SLIDE_IN_DURATION;
    currentTime = t0_end;

    segments.push({
      type: "slide_in",
      tStart: t0_start,
      tEnd: t0_end,
      fromX: startX,
      toX: slot0X,
      fromY: slot0Y,
      toY: slot0Y,
    });
    
    animatingSegments.push({
      tStart: t0_start,
      tEnd: t0_end
    });

    // 2. Try slots 0, 1, ..., targetSlot
    for (let k = 0; k <= targetSlot; k++) {
      const slotX = inputs[k].x + inputs[k].halfWidth;
      const slotY = inputs[k].y;

      if (k < targetSlot) {
        // Slot mismatch: pause briefly to "try to match" and display cross icon
        const tPauseStart = currentTime;
        const tPauseEnd = tPauseStart + PAUSE_DURATION;
        currentTime = tPauseEnd;

        segments.push({
          type: "pause",
          tStart: tPauseStart,
          tEnd: tPauseEnd,
          x: slotX,
          y: slotY,
        });

        indicators.push({
          type: "cross",
          slot: k,
          tStart: tPauseStart,
          tEnd: tPauseEnd,
        });

        // Move down to next slot
        const nextSlotX = inputs[k + 1].x + inputs[k + 1].halfWidth;
        const nextSlotY = inputs[k + 1].y;

        const tMoveStart = currentTime;
        const tMoveEnd = tMoveStart + MOVE_DOWN_DURATION;
        currentTime = tMoveEnd;

        segments.push({
          type: "move_down",
          tStart: tMoveStart,
          tEnd: tMoveEnd,
          fromX: slotX,
          toX: nextSlotX,
          fromY: slotY,
          toY: nextSlotY,
        });
        
        animatingSegments.push({
          tStart: tMoveStart,
          tEnd: tMoveEnd
        });
      } else {
        // Match found (k === targetSlot): seats beside left split permanently and display check icon
        const tMatchStart = currentTime;
        const tMatchEnd = tMatchStart + MATCH_PAUSE;
        currentTime += MATCH_PAUSE;

        segments.push({
          type: "matched",
          tStart: tMatchStart,
          x: slotX,
          y: slotY,
        });

        indicators.push({
          type: "check",
          slot: k,
          tStart: tMatchStart,
          tEnd: tMatchEnd,
        });
      }
    }

    pieces.push({
      index: i,
      pieceStartTime,
      segments,
      finalX: inputs[i].x + inputs[i].halfWidth,
      finalY: inputs[i].y,
    });
  }

  const finalImageStartTime = currentTime;
  const totalDuration = currentTime + OUTRO_DURATION;
  return { pieces, indicators, animatingSegments, finalImageStartTime, totalDuration };
}


// ==================================================
// Build Animated Position Expressions
// ==================================================

function buildPieceXExpr(piece) {
  const startX = WIDTH + 100;
  let expr = `${piece.finalX}`;

  for (let s = piece.segments.length - 1; s >= 0; s--) {
    const seg = piece.segments[s];
    if (seg.type === "matched") {
      expr = `${seg.x}`;
    } else if (seg.type === "pause") {
      expr = `if(lte(t,${seg.tEnd.toFixed(3)}),${seg.x},${expr})`;
    } else if (seg.type === "slide_in" || seg.type === "move_down") {
      const dur = (seg.tEnd - seg.tStart).toFixed(3);
      const p = `((t-${seg.tStart.toFixed(3)})/${dur})`;
      const eased = seg.type === "slide_in"
          ? `(1-pow(1-${p},3))`
          : `(3*pow(${p},2)-2*pow(${p},3))`;
      const segX = `${seg.fromX}+(${seg.toX}-${seg.fromX})*${eased}`;
      expr = `if(lte(t,${seg.tEnd.toFixed(3)}),${segX},${expr})`;
    }
  }

  expr = `if(lt(t,${piece.pieceStartTime.toFixed(3)}),${startX},${expr})`;
  return expr;
}

function buildPieceYExpr(piece, inputs) {
  const startY = inputs[0].y;
  let expr = `${piece.finalY}`;

  for (let s = piece.segments.length - 1; s >= 0; s--) {
    const seg = piece.segments[s];
    if (seg.type === "matched") {
      expr = `${seg.y}`;
    } else if (seg.type === "pause" || seg.type === "slide_in") {
      const yVal = seg.type === "slide_in" ? seg.fromY : seg.y;
      expr = `if(lte(t,${seg.tEnd.toFixed(3)}),${yVal},${expr})`;
    } else if (seg.type === "move_down") {
      const dur = (seg.tEnd - seg.tStart).toFixed(3);
      const p = `((t-${seg.tStart.toFixed(3)})/${dur})`;
      const eased = `(3*pow(${p},2)-2*pow(${p},3))`;
      const segY = `${seg.fromY}+(${seg.toY}-${seg.fromY})*${eased}`;
      expr = `if(lte(t,${seg.tEnd.toFixed(3)}),${segY},${expr})`;
    }
  }

  expr = `if(lt(t,${piece.pieceStartTime.toFixed(3)}),${startY},${expr})`;
  return expr;
}


// ==================================================
// Build FFmpeg filter
// ==================================================

function buildFilterGraph(inputs, timeline, finalImageInfo) {
  let filter = "";

  // ----------------------------------------------
  // Background
  // ----------------------------------------------

  filter +=
      `[0:v]` +
      `scale=${WIDTH}:${HEIGHT},` +
      `setsar=1` +
      `[bg];`;

  let previous = "bg";

  // ----------------------------------------------
  // Overlay all left halves first
  // ----------------------------------------------

  for (let index = 0; index < inputs.length; index++) {
    const item = inputs[index];
    const leftInput = 1 + index * 2;
    const leftLabel = `left_${index}`;
    const leftLayer = `left_layer_${index}`;

    filter +=
        `[${leftInput}:v]` +
        `format=rgba` +
        `[${leftLabel}];`;

    filter +=
        `[${previous}]` +
        `[${leftLabel}]` +
        `overlay=` +
        `${item.x}:${item.y}` +
        `:format=auto` +
        `[${leftLayer}];`;

    previous = leftLayer;
  }

  // ----------------------------------------------
  // Overlay right halves with animated matching path
  // ----------------------------------------------

  for (let order = 0; order < timeline.pieces.length; order++) {
    const piece = timeline.pieces[order];
    const rightInput = 1 + piece.index * 2 + 1;
    const rightLayer = `right_layer_${order}`;

    const animatedX = buildPieceXExpr(piece);
    const animatedY = buildPieceYExpr(piece, inputs);

    filter +=
        `[${previous}]` +
        `[${rightInput}:v]` +
        `overlay=` +
        `'${animatedX}'` +
        `:'${animatedY}'` +
        `:format=auto` +
        `[${rightLayer}];`;

    previous = rightLayer;
  }

  // ----------------------------------------------
  // Overlay match / mismatch indicator icons (check / cross)
  // ----------------------------------------------

  const checkInput = 1 + inputs.length * 2;
  const crossInput = 1 + inputs.length * 2 + 1;

  for (let ind = 0; ind < timeline.indicators.length; ind++) {
    const indicator = timeline.indicators[ind];
    const isLast = ind === timeline.indicators.length - 1;
    const indLayer = isLast ? "final" : `ind_layer_${ind}`;

    const iconLabel =
        indicator.type === "check"
            ? `${checkInput}:v`
            : `${crossInput}:v`;

    const slotItem = inputs[indicator.slot];
    const iconX = slotItem.x + slotItem.width + 40;
    const iconY = Math.round(
        slotItem.y + (slotItem.height - ICON_SIZE) / 2
    );

    filter +=
        `[${previous}]` +
        `[${iconLabel}]` +
        `overlay=` +
        `${iconX}:${iconY}` +
        `:enable='between(t,${indicator.tStart.toFixed(3)},${indicator.tEnd.toFixed(3)})'` +
        `:format=auto` +
        `[${indLayer}];`;

    previous = indLayer;
  }

  // ----------------------------------------------
  // Final image overlay
  // ----------------------------------------------
  const finalImageInput = finalImageInfo ? crossInput + 1 : -1;
  
  if (finalImageInfo) {
    const finalImageLayer = "final_image_layer";
    filter += `[${previous}][${finalImageInput}:v]overlay=${finalImageInfo.x}:${finalImageInfo.y}:enable='gte(t,${timeline.finalImageStartTime.toFixed(3)})':format=auto[${finalImageLayer}];`;
    previous = finalImageLayer;
    
    if (finalImageInfo.bigCheck) {
      const bigCheckInput = finalImageInput + 1;
      const bigCheckLayer = "big_check_layer";
      filter += `[${previous}][${bigCheckInput}:v]overlay=${finalImageInfo.bigCheck.x}:${finalImageInfo.bigCheck.y}:enable='gte(t,${timeline.finalImageStartTime.toFixed(3)})':format=auto[${bigCheckLayer}];`;
      previous = bigCheckLayer;
    }
  }

  // ----------------------------------------------
  // Final output
  // ----------------------------------------------

  filter +=
      `[${previous}]` +
      `format=yuv420p` +
      `[vout];`;

  // ----------------------------------------------
  // Audio filter graph
  // ----------------------------------------------

  let currentAudioIdx = crossInput + 1;
  if (finalImageInfo) {
    currentAudioIdx++; // final image
    if (finalImageInfo.bigCheck) {
      currentAudioIdx++; // big check
    }
  }
  let amixInputs = "";
  let totalAudioStreams = timeline.animatingSegments.length + timeline.indicators.length + 1;

  // Add a silent track of totalDuration to keep amix alive
  filter += `anullsrc=d=${timeline.totalDuration.toFixed(3)}[silence];`;
  amixInputs += `[silence]`;

  for (let i = 0; i < timeline.animatingSegments.length; i++) {
    const seg = timeline.animatingSegments[i];
    const delay = Math.round(seg.tStart * 1000);
    const segDuration = (seg.tEnd - seg.tStart).toFixed(3);
    
    filter += `[${currentAudioIdx}:a]aloop=loop=-1:size=2e9,atrim=0:${segDuration},adelay=${delay}:all=1[animSeg${i}];`;
    amixInputs += `[animSeg${i}]`;
    currentAudioIdx++;
  }

  for (let i = 0; i < timeline.indicators.length; i++) {
    const ind = timeline.indicators[i];
    const delay = Math.round(ind.tStart * 1000);
    
    filter += `[${currentAudioIdx}:a]adelay=${delay}:all=1[sfx${i}];`;
    amixInputs += `[sfx${i}]`;
    currentAudioIdx++;
  }

  filter += `${amixInputs}amix=inputs=${totalAudioStreams}:normalize=0[amixed];`;
  filter += `[amixed]atrim=0:${timeline.totalDuration.toFixed(3)}[aout]`;

  return filter;
}


// ==================================================
// Build FFmpeg command
// ==================================================

function buildFFmpegArgs(
    inputs,
    filter,
    duration,
    checkPath,
    crossPath,
    outputPath,
    timeline,
    finalImageInfo
) {
  const args = [
    "-y",

    // Background
    "-loop",
    "1",
    "-i",
    BACKGROUND_FILE,
  ];


  // ----------------------------------------------
  // PNG inputs
  // ----------------------------------------------

  for (const item of inputs) {
    args.push(
        "-loop",
        "1",
        "-i",
        item.leftPath
    );

    args.push(
        "-loop",
        "1",
        "-i",
        item.rightPath
    );
  }

  // ----------------------------------------------
  // Control icons (check & cross)
  // ----------------------------------------------

  args.push(
      "-loop",
      "1",
      "-i",
      checkPath
  );

  args.push(
      "-loop",
      "1",
      "-i",
      crossPath
  );

  if (finalImageInfo) {
    args.push("-loop", "1", "-i", finalImageInfo.path);
    if (finalImageInfo.bigCheck) {
      args.push("-loop", "1", "-i", finalImageInfo.bigCheck.path);
    }
  }

  // ----------------------------------------------
  // Audio Inputs
  // ----------------------------------------------
  for (const seg of timeline.animatingSegments) {
    args.push("-i", ANIMATING_MP3);
  }
  for (const ind of timeline.indicators) {
    args.push("-i", ind.type === "check" ? CORRECT_MP3 : WRONG_MP3);
  }

  // ----------------------------------------------
  // Filter
  // ----------------------------------------------

  args.push(
      "-filter_complex",
      filter
  );


  // ----------------------------------------------
  // Output mapping
  // ----------------------------------------------

  args.push(
      "-map",
      "[vout]",
      "-map",
      "[aout]"
  );


  // ----------------------------------------------
  // Duration
  // ----------------------------------------------

  args.push(
      "-t",
      duration.toString()
  );


  // ----------------------------------------------
  // Encoding
  // ----------------------------------------------

  args.push(
      "-r",
      FPS.toString(),

      "-c:v",
      "libx264",

      "-preset",
      "medium",

      "-crf",
      "18",

      "-pix_fmt",
      "yuv420p",
      
      "-c:a",
      "aac",
      
      "-b:a",
      "192k",

      "-movflags",
      "+faststart"
  );


  args.push(
      outputPath
  );


  return args;
}


// ==================================================
// Run FFmpeg
// ==================================================

function runFFmpeg(args) {
  return new Promise(
      (resolve, reject) => {

        const ffmpeg =
            spawn(
                "ffmpeg",
                args
            );


        ffmpeg.stderr.on(
            "data",
            (data) => {
              process.stderr.write(
                  data.toString()
              );
            }
        );


        ffmpeg.on(
            "error",
            (error) => {
              reject(error);
            }
        );


        ffmpeg.on(
            "close",
            (code) => {

              if (code === 0) {
                resolve();
              } else {
                reject(
                    new Error(
                        `FFmpeg exited with code ${code}`
                    )
                );
              }
            }
        );
      }
  );
}


// ==================================================
// Create video
// ==================================================

async function createWordAnimation(
    word,
    alphabet,
    outputPath
) {
  console.log(
      `\nCreating video: ${word}`
  );


  const tempDir =
      path.join(
          OUTPUT_DIR,
          `.temp-${word}-${Date.now()}`
      );


  fs.mkdirSync(
      tempDir,
      {
        recursive: true,
      }
  );


  try {

    // --------------------------------------------
    // Prepare letters & control icons
    // --------------------------------------------

    const {
      inputs,
      crossPath,
      checkPath,
      finalImageInfo
    } = await prepareLetterHalves(
        word,
        alphabet,
        tempDir
    );


    // --------------------------------------------
    // Timeline & Duration
    // --------------------------------------------

    const timeline =
        calculateTimeline(inputs);

    const duration =
        timeline.totalDuration;


    // --------------------------------------------
    // Filter
    // --------------------------------------------

    const filter =
        buildFilterGraph(
            inputs,
            timeline,
            finalImageInfo
        );


    // --------------------------------------------
    // Debug
    // --------------------------------------------

    console.log(
        "\n========== FILTER ==========\n"
    );

    console.log(filter);

    console.log(
        "\n============================\n"
    );


    // --------------------------------------------
    // FFmpeg
    // --------------------------------------------

    const args =
        buildFFmpegArgs(
            inputs,
            filter,
            duration,
            checkPath,
            crossPath,
            outputPath,
            timeline,
            finalImageInfo
        );


    await runFFmpeg(args);


    console.log(
        `Finished: ${outputPath}`
    );

  } finally {

    fs.rmSync(
        tempDir,
        {
          recursive: true,
          force: true,
        }
    );
  }
}


// ==================================================
// Main
// ==================================================

async function main() {
  try {

    // --------------------------------------------
    // Output directory
    // --------------------------------------------

    fs.mkdirSync(
        OUTPUT_DIR,
        {
          recursive: true,
        }
    );


    // --------------------------------------------
    // Load assets
    // --------------------------------------------

    console.log(
        "\nLoading alphabet assets...\n"
    );

    const alphabet =
        await loadAlphabetAssets();


    // --------------------------------------------
    // Load words
    // --------------------------------------------

    const words =
        loadWords();


    console.log(
        `\nFound ${words.length} words.\n`
    );


    // --------------------------------------------
    // Generate videos
    // --------------------------------------------

    const BATCH_SIZE = 3;
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batch = words.slice(i, i + BATCH_SIZE);
      
      console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(words.length / BATCH_SIZE)}...`);
      
      const promises = batch.map(async (word) => {
        validateWord(word, alphabet);
        const outputPath = path.join(OUTPUT_DIR, `${word}.mp4`);
        
        try {
          await createWordAnimation(word, alphabet, outputPath);
        } catch (err) {
          console.error(`Error processing ${word}:`, err);
          throw err;
        }
      });

      await Promise.all(promises);
    }


    console.log(
        "\nAll videos generated."
    );

  } catch (error) {

    console.error(
        "\nERROR:"
    );

    console.error(
        error
    );

    process.exit(1);
  }
}


// ==================================================
// Start
// ==================================================

main();