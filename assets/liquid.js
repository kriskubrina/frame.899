'use strict';

// This script is a modified version of the WebGL-Fluid-Simulation library by Pavel Dobryakov
// https://github.com/PavelDoGreat/WebGL-Fluid-Simulation

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    const canvas = document.getElementById('background');
    if (!canvas) {
        console.error('Canvas element with ID "background" not found.');
        return;
    }
    console.log('Canvas element found:', canvas);
    resizeCanvas();

    let config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024,
    CAPTURE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 1,
    VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.25,
    SPLAT_FORCE: 6000,
    SHADING: true,
    COLORFUL: true,
    COLOR_UPDATE_SPEED: 10,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    TRANSPARENT: false,
    BLOOM: true,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: true,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 1.0,
}

function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

let pointers = [];
let splatStack = [];
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

if (isMobile()) {
    config.DYE_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512;
    config.SHADING = false;
    config.BLOOM = false;
    config.SUNRAYS = false;
}

function getWebGLContext (canvas) {
    console.log('Getting WebGL context...');
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (isWebGL2) {
        console.log('WebGL2 context obtained.');
    } else {
        console.log('WebGL2 not supported, falling back to WebGL1.');
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
        if (gl) {
            console.log('WebGL1 context obtained.');
        } else {
            console.error('WebGL is not supported on this browser.');
            return { gl: null, ext: {} };
        }
    }

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    }
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}

function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}

class GLProgram {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = gl.createProgram();

        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw gl.getProgramInfoLog(this.program);

        const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
        }
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function compileShader (type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw gl.getShaderInfoLog(shader);

    return shader;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 a_position;
    varying vec2 v_texcoord;

    void main () {
        v_texcoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`);

const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;
    uniform float u_value;

    void main () {
        gl_FragColor = u_value * texture2D(u_texture, v_texcoord);
    }
`);

const colorShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;

    uniform vec4 u_color;

    void main () {
        gl_FragColor = u_color;
    }
`);

const backgroundShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;

    void main () {
        gl_FragColor = texture2D(u_texture, v_texcoord);
    }
`);

const displayShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;

    void main () {
        vec3 C = texture2D(u_texture, v_texcoord).rgb;
        float a = max(C.r, max(C.g, C.b));
        gl_FragColor = vec4(C, a);
    }
`);

const displayShadingShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;
    uniform sampler2D u_dye;
    uniform vec2 u_texelSize;

    void main () {
        vec3 C = texture2D(u_texture, v_texcoord).rgb;
        vec3 L = texture2D(u_dye, v_texcoord).rgb;
        vec3 H = vec3(0.1, 0.1, 0.1);
        float a = max(C.r, max(C.g, C.b));
        vec3 finalC = C * H;
        gl_FragColor = vec4(finalC, a);
    }
`);

const bloomPrefilterShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;
    uniform vec3 u_curve;
    uniform float u_threshold;

    void main () {
        vec3 c = texture2D(u_texture, v_texcoord).rgb;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - u_curve.x, 0.0, u_curve.y);
        rq = u_curve.z * rq * rq;
        c *= max(rq, br - u_threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c, 0.0);
    }
`);

const bloomBlurShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;
    uniform vec2 u_texelSize;

    void main () {
        vec3 result = vec3(0.0);
        vec2 sig = vec2(1.0, 1.0);
        float weight = 1.0;
        for (int i = -4; i <= 4; i++) {
            float x = float(i) * sig.x;
            result += texture2D(u_texture, v_texcoord + vec2(x, 0.0) * u_texelSize).rgb * weight;
        }
        for (int i = -4; i <= 4; i++) {
            float y = float(i) * sig.y;
            result += texture2D(u_texture, v_texcoord + vec2(0.0, y) * u_texelSize).rgb * weight;
        }
        gl_FragColor = vec4(result * 0.04, 1.0);
    }
`);

const bloomFinalShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;
    uniform float u_intensity;

    void main () {
        gl_FragColor = u_intensity * texture2D(u_texture, v_texcoord);
    }
`);

const sunraysMaskShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;

    void main () {
        vec4 c = texture2D(u_texture, v_texcoord);
        float br = max(c.r, max(c.g, c.b));
        c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
        gl_FragColor = c;
    }
`);

const sunraysShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;
    uniform float u_weight;

    void main () {
        float lumen = texture2D(u_texture, v_texcoord).r;
        gl_FragColor = vec4(lumen * u_weight, 0.0, 0.0, 1.0);
    }
`);

const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_target;
    uniform float u_aspectRatio;
    uniform vec3 u_color;
    uniform vec2 u_point;
    uniform float u_radius;

    void main () {
        vec2 p = v_texcoord - u_point.xy;
        p.x *= u_aspectRatio;
        vec3 splat = exp(-dot(p, p) / u_radius) * u_color;
        vec3 base = texture2D(u_target, v_texcoord).rgb;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`);

const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_velocity;
    uniform sampler2D u_source;
    uniform vec2 u_texelSize;
    uniform float u_dt;
    uniform float u_dissipation;

    void main () {
        vec2 coord = v_texcoord - u_dt * texture2D(u_velocity, v_texcoord).xy * u_texelSize;
        gl_FragColor = u_dissipation * texture2D(u_source, coord);
    }
`);

const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_velocity;
    uniform vec2 u_texelSize;

    void main () {
        float L = texture2D(u_velocity, v_texcoord - vec2(u_texelSize.x, 0.0)).x;
        float R = texture2D(u_velocity, v_texcoord + vec2(u_texelSize.x, 0.0)).x;
        float B = texture2D(u_velocity, v_texcoord - vec2(0.0, u_texelSize.y)).y;
        float T = texture2D(u_velocity, v_texcoord + vec2(0.0, u_texelSize.y)).y;
        vec2 C = texture2D(u_velocity, v_texcoord).xy;
        if (v_texcoord.x < u_texelSize.x) { L = -C.x; }
        if (v_texcoord.x > 1.0 - u_texelSize.x) { R = -C.x; }
        if (v_texcoord.y < u_texelSize.y) { B = -C.y; }
        if (v_texcoord.y > 1.0 - u_texelSize.y) { T = -C.y; }
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`);

const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_velocity;
    uniform vec2 u_texelSize;

    void main () {
        float L = texture2D(u_velocity, v_texcoord - vec2(u_texelSize.x, 0.0)).y;
        float R = texture2D(u_velocity, v_texcoord + vec2(u_texelSize.x, 0.0)).y;
        float B = texture2D(u_velocity, v_texcoord - vec2(0.0, u_texelSize.y)).x;
        float T = texture2D(u_velocity, v_texcoord + vec2(0.0, u_texelSize.y)).x;
        float curl = 0.5 * (R - L - T + B);
        gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
    }
`);

const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_velocity;
    uniform sampler2D u_curl;
    uniform float u_curl_strength;
    uniform float u_dt;
    uniform vec2 u_texelSize;

    void main () {
        float L = texture2D(u_curl, v_texcoord - vec2(u_texelSize.x, 0.0)).r;
        float R = texture2D(u_curl, v_texcoord + vec2(u_texelSize.x, 0.0)).r;
        float B = texture2D(u_curl, v_texcoord - vec2(0.0, u_texelSize.y)).r;
        float T = texture2D(u_curl, v_texcoord + vec2(0.0, u_texelSize.y)).r;
        float C = texture2D(u_curl, v_texcoord).r;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= u_curl_strength * C;
        force.y *= -1.0;
        vec2 vel = texture2D(u_velocity, v_texcoord).xy;
        gl_FragColor = vec4(vel + force * u_dt, 0.0, 1.0);
    }
`);

const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_pressure;
    uniform sampler2D u_divergence;
    uniform vec2 u_texelSize;

    void main () {
        float L = texture2D(u_pressure, v_texcoord - vec2(u_texelSize.x, 0.0)).r;
        float R = texture2D(u_pressure, v_texcoord + vec2(u_texelSize.x, 0.0)).r;
        float B = texture2D(u_pressure, v_texcoord - vec2(0.0, u_texelSize.y)).r;
        float T = texture2D(u_pressure, v_texcoord + vec2(0.0, u_texelSize.y)).r;
        float C = texture2D(u_pressure, v_texcoord).r;
        float divergence = texture2D(u_divergence, v_texcoord).r;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`);

const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texcoord;
    uniform sampler2D u_pressure;
    uniform sampler2D u_velocity;
    uniform vec2 u_texelSize;

    void main () {
        float L = texture2D(u_pressure, v_texcoord - vec2(u_texelSize.x, 0.0)).r;
        float R = texture2D(u_pressure, v_texcoord + vec2(u_texelSize.x, 0.0)).r;
        float B = texture2D(u_pressure, v_texcoord - vec2(0.0, u_texelSize.y)).r;
        float T = texture2D(u_pressure, v_texcoord + vec2(0.0, u_texelSize.y)).r;
        vec2 velocity = texture2D(u_velocity, v_texcoord).xy;
        velocity.xy -= 0.5 * vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (destination) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

let dye;
let velocity;
let divergence;
let curl;
let pressure;
let bloom;
let bloomFramebuffers = [];
let sunrays;
let sunraysTemp;

const clearProgram = new GLProgram(baseVertexShader, clearShader);
const colorProgram = new GLProgram(baseVertexShader, colorShader);
const backgroundProgram = new GLProgram(baseVertexShader, backgroundShader);
const displayProgram = new GLProgram(baseVertexShader, displayShader);
const displayShadingProgram = new GLProgram(baseVertexShader, displayShadingShader);
const bloomPrefilterProgram = new GLProgram(baseVertexShader, bloomPrefilterShader);
const bloomBlurProgram = new GLProgram(baseVertexShader, bloomBlurShader);
const bloomFinalProgram = new GLProgram(baseVertexShader, bloomFinalShader);
const sunraysMaskProgram = new GLProgram(baseVertexShader, sunraysMaskShader);
const sunraysProgram = new GLProgram(baseVertexShader, sunraysShader);
const splatProgram = new GLProgram(baseVertexShader, splatShader);
const advectionProgram = new GLProgram(baseVertexShader, advectionShader);
const divergenceProgram = new GLProgram(baseVertexShader, divergenceShader);
const curlProgram = new GLProgram(baseVertexShader, curlShader);
const vorticityProgram = new GLProgram(baseVertexShader, vorticityShader);
const pressureProgram = new GLProgram(baseVertexShader, pressureShader);
const gradientSubtractProgram = new GLProgram(baseVertexShader, gradientSubtractShader);

function initFramebuffers () {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    divergence = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    initBloomFramebuffers();
    initSunraysFramebuffers();
}

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSize = { x: 1.0 / w, y: 1.0 / h };

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSize,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function resizeFBO (target, w, h, internalFormat, format, type, param) {
    let newFBO = createFBO(w, h, internalFormat, format, type, param);
    clearProgram.bind();
    gl.uniform1f(clearProgram.uniforms.u_value, 1.0);
    gl.uniform1i(clearProgram.uniforms.u_texture, target.attach(0));
    blit(newFBO.fbo);
    return newFBO;
}

function resizeDoubleFBO (target, w, h, internalFormat, format, type, param) {
    if (target.read.width == w && target.read.height == h)
        return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    return target;
}

function initBloomFramebuffers () {
    let res = getResolution(config.BLOOM_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);

    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++)
    {
        let width = res.width >> (i + 1);
        let height = res.height >> (i + 1);

        if (width < 2 || height < 2) break;

        let fbo = createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
        bloomFramebuffers.push(fbo);
    }
}

function initSunraysFramebuffers () {
    let res = getResolution(config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunrays = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    sunraysTemp = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
}

function update () {
    console.log('Update function called.');
    const dt = calcDeltaTime();
    if (resizeCanvas())
        initFramebuffers();
    updateColors(dt);
    applyInputs();
    if (!config.PAUSED)
        step(dt);
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

function updateColors (dt) {
    if (!config.COLORFUL) return;

    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = 0;
        for (let i = 0; i < pointers.length; i++) {
            pointers[i].color = generateColor();
        }
    }
}

function applyInputs () {
    if (splatStack.length > 0)
        multipleSplats(splatStack.pop());

    for (let i = 0; i < pointers.length; i++) {
        const p = pointers[i];
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    }
}

function step (dt) {
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, velocity.read.width, velocity.read.height);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.u_texelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    gl.uniform1i(curlProgram.uniforms.u_velocity, velocity.read.attach(0));
    blit(curl.fbo);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.u_texelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    gl.uniform1i(vorticityProgram.uniforms.u_velocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.u_curl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.u_curl_strength, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.u_dt, dt);
    blit(velocity.write.fbo);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.u_texelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    gl.uniform1i(divergenceProgram.uniforms.u_velocity, velocity.read.attach(0));
    blit(divergence.fbo);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.u_texture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.u_value, config.PRESSURE);
    blit(pressure.write.fbo);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.u_texelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    gl.uniform1i(pressureProgram.uniforms.u_divergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.u_pressure, pressure.read.attach(1));
        blit(pressure.write.fbo);
        pressure.swap();
    }

    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.uniforms.u_texelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    gl.uniform1i(gradientSubtractProgram.uniforms.u_pressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.u_velocity, velocity.read.attach(1));
    blit(velocity.write.fbo);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.u_texelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.u_dyeTexelSize, velocity.read.texelSize.x, velocity.read.texelSize.y);
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.u_velocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.u_source, velocityId);
    gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
    gl.uniform1f(advectionProgram.uniforms.u_dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write.fbo);
    velocity.swap();

    gl.viewport(0, 0, dye.read.width, dye.read.height);

    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.u_dyeTexelSize, dye.read.texelSize.x, dye.read.texelSize.y);
    gl.uniform1i(advectionProgram.uniforms.u_velocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.u_source, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.u_dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write.fbo);
    dye.swap();
}

function render (target) {
    if (config.BLOOM)
        applyBloom(dye.read, bloom);
    if (config.SUNRAYS) {
        applySunrays(dye.read, sunrays);
        blur(sunrays, sunraysTemp, 1);
    }

    if (target == null || !config.TRANSPARENT) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
    }
    else {
        gl.disable(gl.BLEND);
    }

    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;
    gl.viewport(0, 0, width, height);

    if (!config.TRANSPARENT) {
        colorProgram.bind();
        let bc = config.BACK_COLOR;
        gl.uniform4f(colorProgram.uniforms.u_color, bc.r / 255, bc.g / 255, bc.b / 255, 1);
        blit(target);
    }

    if (target == null && config.TRANSPARENT) {
        backgroundProgram.bind();
        gl.uniform1i(backgroundProgram.uniforms.u_texture, dye.read.attach(0));
        blit(null);
    }

    if (config.SHADING) {
        displayShadingProgram.bind();
        gl.uniform2f(displayShadingProgram.uniforms.u_texelSize, 1.0 / dye.read.width, 1.0 / dye.read.height);
        gl.uniform1i(displayShadingProgram.uniforms.u_texture, dye.read.attach(0));
        gl.uniform1i(displayShadingProgram.uniforms.u_dye, dye.read.attach(1));
    }
    else {
        displayProgram.bind();
        gl.uniform1i(displayProgram.uniforms.u_texture, dye.read.attach(0));
    }
    blit(target);

    if (config.BLOOM) {
        gl.blendFunc(gl.ONE, gl.ONE);
        bloomFinalProgram.bind();
        gl.uniform1f(bloomFinalProgram.uniforms.u_intensity, config.BLOOM_INTENSITY);
        gl.uniform1i(bloomFinalProgram.uniforms.u_texture, bloom.attach(0));
        blit(target);
    }

    if (config.SUNRAYS) {
        gl.blendFunc(gl.ONE, gl.ONE);
        sunraysProgram.bind();
        gl.uniform1f(sunraysProgram.uniforms.u_weight, config.SUNRAYS_WEIGHT);
        gl.uniform1i(sunraysProgram.uniforms.u_texture, sunrays.attach(0));
        blit(target);
    }
}

function applyBloom (source, destination) {
    if (bloomFramebuffers.length < 2)
        return;

    let last = destination;

    gl.disable(gl.BLEND);
    bloomPrefilterProgram.bind();
    let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
    let curve0 = config.BLOOM_THRESHOLD - knee;
    let curve1 = knee * 2;
    let curve2 = 0.25 / knee;
    gl.uniform3f(bloomPrefilterProgram.uniforms.u_curve, curve0, curve1, curve2);
    gl.uniform1f(bloomPrefilterProgram.uniforms.u_threshold, config.BLOOM_THRESHOLD);
    gl.uniform1i(bloomPrefilterProgram.uniforms.u_texture, source.attach(0));
    gl.viewport(0, 0, last.width, last.height);
    blit(last.fbo);

    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
        let dest = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.u_texelSize, last.texelSize.x, last.texelSize.y);
        gl.uniform1i(bloomBlurProgram.uniforms.u_texture, last.attach(0));
        gl.viewport(0, 0, dest.width, dest.height);
        blit(dest.fbo);
        last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        let baseTex = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.u_texelSize, last.texelSize.x, last.texelSize.y);
        gl.uniform1i(bloomBlurProgram.uniforms.u_texture, last.attach(0));
        gl.viewport(0, 0, baseTex.width, baseTex.height);
        blit(baseTex.fbo);
        last = baseTex;
    }

    gl.disable(gl.BLEND);
    gl.uniform2f(bloomBlurProgram.uniforms.u_texelSize, last.texelSize.x, last.texelSize.y);
    gl.uniform1i(bloomBlurProgram.uniforms.u_texture, last.attach(0));
    gl.viewport(0, 0, destination.width, destination.height);
    blit(destination.fbo);
}

function applySunrays (source, destination) {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniforms.u_texture, source.attach(0));
    gl.viewport(0, 0, destination.width, destination.height);
    blit(destination.fbo);

    let weight = config.SUNRAYS_WEIGHT;
    let iterations = 16;
    let radius = 0.5;

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = 0; i < iterations; i++) {
        let progress = i / (iterations - 1);
        sunraysProgram.bind();
        gl.uniform1f(sunraysProgram.uniforms.u_weight, weight * progress);
        gl.uniform1f(sunraysProgram.uniforms.u_radius, radius);
        gl.uniform1i(sunraysProgram.uniforms.u_texture, destination.attach(0));
        gl.viewport(0, 0, destination.width, destination.height);
        blit(destination.fbo);
    }
}

function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE;
    let dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
}

function multipleSplats (amount) {
    for (let i = 0; i < amount; i++) {
        const color = generateColor();
        const x = Math.random();
        const y = Math.random();
        const dx = 1000 * (Math.random() - 0.5);
        const dy = 1000 * (Math.random() - 0.5);
        splat(x, y, dx, dy, color);
    }
}

function splat (x, y, dx, dy, color) {
    gl.viewport(0, 0, velocity.read.width, velocity.read.height);
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.u_target, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.u_aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.u_point, x, y);
    gl.uniform3f(splatProgram.uniforms.u_color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.u_radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    blit(velocity.write.fbo);
    velocity.swap();

    gl.viewport(0, 0, dye.read.width, dye.read.height);
    gl.uniform1i(splatProgram.uniforms.u_target, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.u_color, color.r / 255, color.g / 255, color.b / 255);
    blit(dye.write.fbo);
    dye.swap();
}

function correctRadius (radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        radius *= aspectRatio;
    return radius;
}

canvas.addEventListener('mousedown', e => {
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    let pointer = pointers.find(p => p.id == -1);
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    if (!pointer.down) return;
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers.find(p => p.id == -1);
        if (pointer == null)
            pointer = new pointerPrototype();
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerDownData(pointer, touches[i].identifier, posX, posY);
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerMoveData(pointer, posX, posY);
    }
}, false);

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'KeyP')
        config.PAUSED = !config.PAUSED;
    if (e.key === ' ')
        splatStack.push(parseInt(Math.random() * 20) + 5);
});

function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = generateColor();
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1)
        delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        delta /= aspectRatio;
    return delta;
}

function generateColor () {
    let c = HSVtoRGB(Math.random(), 1.0, 1.0);
    c.r *= 0.15;
    c.g *= 0.15;
    c.b *= 0.15;
    return c;
}

function HSVtoRGB (h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return {
        r: r * 255,
        g: g * 255,
        b: b * 255
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;

initFramebuffers();
update();
});