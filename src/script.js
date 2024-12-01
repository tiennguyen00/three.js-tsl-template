import GUI from 'lil-gui'
import * as THREE from 'three/webgpu'
import { sin, positionLocal, time, vec2, vec3, vec4, uv, uniform, color, rangeFog } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * Base
 */
// Debug
const gui = new GUI({
    width: 400
})

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()
const fogColor = uniform(color('#1b191f'))
const fogNode = rangeFog(fogColor, 20, 50)
scene.fogNode = fogNode

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100)
camera.position.x = 6
camera.position.y = 3
camera.position.z = 10
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    forceWebGL: false
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(fogColor.value)

/**
 * Dummy
 */
// Material
const material = new THREE.MeshBasicNodeMaterial()

// Uniforms
const timeFrequency = uniform(0.5)
const positionFrequency = uniform(2)
const intensityFrequency = uniform(0.5)

// Position
const oscillation = sin(time.mul(timeFrequency).add(positionLocal.y.mul(positionFrequency))).mul(intensityFrequency)
material.positionNode = vec3(
    positionLocal.x.add(oscillation),
    positionLocal.y,
    positionLocal.z
)

// Color
material.colorNode = vec4(
    uv().mul(vec2(32, 8)).fract(),
    1,
    1
)

// Mesh
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.35, 128, 32), material)
scene.add(mesh)

// Tweaks
gui.add(timeFrequency, 'value').min(0).max(5).name('timeFrequency')
gui.add(positionFrequency, 'value').min(0).max(5).name('positionFrequency')
gui.add(intensityFrequency, 'value').min(0).max(5).name('intensityFrequency')

/**
 * Animate
 */
const tick = () =>
{
    // Update controls
    controls.update()

    // Render
    renderer.renderAsync(scene, camera)
}
renderer.setAnimationLoop(tick)