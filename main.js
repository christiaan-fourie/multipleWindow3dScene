import WindowManager from './WindowManager.js'

const t = THREE;
let camera, scene, renderer, world;
let near, far;
let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let particleSystems = []; // Changed from cubes to particleSystems
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

// Particle control variables
let particleControls = {
    count: 2000,
    speed: 1.0,
    attraction: 0.002,
    size: 3,
    opacity: 0.9,
    resetRadius: 200,
    centerPoints: 3,        // Number of moving center points
    centerSpeed: 0.5,       // Speed of center point movement
    centerRadius: 300       // Radius of center point movement
};

let controlPanel = null;
let isCollapsed = false;

let today = new Date();
today.setHours(0);
today.setMinutes(0);
today.setSeconds(0);
today.setMilliseconds(0);
today = today.getTime();

let internalTime = getTime();
let windowManager;
let initialized = false;

// get time in seconds since beginning of the day (so that all windows use the same time)
function getTime ()
{
    return (new Date().getTime() - today) / 1000.0;
}

function isLeftmostWindow() {
    let wins = windowManager.getWindows();
    let thisWindow = windowManager.getThisWindowData();
    
    if (!wins || wins.length === 0) return true;
    
    let leftmostX = Math.min(...wins.map(w => w.shape.x));
    return thisWindow.shape.x === leftmostX;
}

function createControlPanel() {
    // Remove existing panel if it exists
    if (controlPanel) {
        controlPanel.remove();
        controlPanel = null;
    }

    // Only create panel on leftmost window
    if (!isLeftmostWindow()) return;

    controlPanel = document.createElement('div');
    controlPanel.style.position = 'fixed';
    controlPanel.style.top = '10px';
    controlPanel.style.left = '10px';
    controlPanel.style.background = 'rgba(0, 0, 0, 0.9)';
    controlPanel.style.color = 'white';
    controlPanel.style.padding = '10px';
    controlPanel.style.borderRadius = '8px';
    controlPanel.style.fontFamily = 'Arial, sans-serif';
    controlPanel.style.fontSize = '12px';
    controlPanel.style.zIndex = '1000';
    controlPanel.style.minWidth = '200px';
    controlPanel.style.border = '1px solid #444';
    controlPanel.style.transition = 'all 0.3s ease';

    // Header with collapse button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';
    header.style.cursor = 'pointer';

    const title = document.createElement('h3');
    title.textContent = 'Particle Controls';
    title.style.margin = '0';
    title.style.fontSize = '14px';

    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = isCollapsed ? '▼' : '▲';
    collapseBtn.style.background = 'none';
    collapseBtn.style.border = 'none';
    collapseBtn.style.color = 'white';
    collapseBtn.style.fontSize = '12px';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.padding = '2px 6px';

    header.appendChild(title);
    header.appendChild(collapseBtn);
    controlPanel.appendChild(header);

    // Controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = isCollapsed ? 'none' : 'block';
    
    // Helper function to create control inputs
    function createControl(label, key, min, max, step) {
        const container = document.createElement('div');
        container.style.marginBottom = '10px';

        const labelEl = document.createElement('label');
        labelEl.textContent = label + ': ';
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '3px';
        labelEl.style.fontSize = '11px';

        const input = document.createElement('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = particleControls[key];
        input.style.width = '100%';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = particleControls[key];
        valueDisplay.style.float = 'right';
        valueDisplay.style.fontSize = '10px';
        valueDisplay.style.color = '#ccc';

        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            particleControls[key] = value;
            valueDisplay.textContent = value;
            
            // Broadcast changes to all windows via localStorage
            localStorage.setItem('particleControls', JSON.stringify(particleControls));
            
            // Update material properties in real-time for certain controls
            if (key === 'size' || key === 'opacity') {
                updateMaterialProperties();
            }
        });

        container.appendChild(labelEl);
        container.appendChild(input);
        container.appendChild(valueDisplay);
        
        return container;
    }

    // Create controls
    controlsContainer.appendChild(createControl('Particle Count', 'count', 500, 5000, 100));
    controlsContainer.appendChild(createControl('Speed', 'speed', 0.1, 3.0, 0.1));
    controlsContainer.appendChild(createControl('Attraction', 'attraction', 0.001, 0.01, 0.001));
    controlsContainer.appendChild(createControl('Size', 'size', 1, 10, 0.5));
    controlsContainer.appendChild(createControl('Opacity', 'opacity', 0.1, 1.0, 0.1));
    controlsContainer.appendChild(createControl('Reset Radius', 'resetRadius', 100, 500, 25));
    
    // New center point controls
    controlsContainer.appendChild(createControl('Center Points', 'centerPoints', 1, 8, 1));
    controlsContainer.appendChild(createControl('Center Speed', 'centerSpeed', 0.1, 2.0, 0.1));
    controlsContainer.appendChild(createControl('Center Radius', 'centerRadius', 100, 500, 25));

    // Rebuild button
    const rebuildBtn = document.createElement('button');
    rebuildBtn.textContent = 'Rebuild All Particles';
    rebuildBtn.style.width = '100%';
    rebuildBtn.style.padding = '8px';
    rebuildBtn.style.marginTop = '10px';
    rebuildBtn.style.background = '#444';
    rebuildBtn.style.color = 'white';
    rebuildBtn.style.border = 'none';
    rebuildBtn.style.borderRadius = '4px';
    rebuildBtn.style.cursor = 'pointer';
    rebuildBtn.style.fontSize = '11px';
    
    rebuildBtn.addEventListener('click', () => {
        // Broadcast rebuild command to all windows
        localStorage.setItem('rebuildParticles', Date.now().toString());
    });

    controlsContainer.appendChild(rebuildBtn);

    // Collapse functionality
    const toggleCollapse = () => {
        isCollapsed = !isCollapsed;
        controlsContainer.style.display = isCollapsed ? 'none' : 'block';
        collapseBtn.textContent = isCollapsed ? '▼' : '▲';
        
        if (isCollapsed) {
            controlPanel.style.minWidth = '140px';
        } else {
            controlPanel.style.minWidth = '200px';
        }
        
        localStorage.setItem('controlPanelCollapsed', isCollapsed.toString());
    };

    header.addEventListener('click', toggleCollapse);
    collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapse();
    });

    controlPanel.appendChild(controlsContainer);
    document.body.appendChild(controlPanel);

    // Load saved collapse state
    const savedCollapsed = localStorage.getItem('controlPanelCollapsed');
    if (savedCollapsed === 'true' && !isCollapsed) {
        toggleCollapse();
    }
}

function updateMaterialProperties() {
    particleSystems.forEach(ps => {
        ps.material.size = particleControls.size;
        ps.material.opacity = particleControls.opacity;
        ps.material.needsUpdate = true;
    });
}

// Function to calculate moving center points
function getCenterPoints(time, windowIndex) {
    const centers = [];
    const numCenters = particleControls.centerPoints;
    const radius = particleControls.centerRadius;
    const speed = particleControls.centerSpeed;
    
    for (let i = 0; i < numCenters; i++) {
        const offset = (i / numCenters) * Math.PI * 2;
        const timeOffset = windowIndex * 0.5; // Different timing per window
        
        const x = Math.cos(time * speed + offset + timeOffset) * radius;
        const y = Math.sin(time * speed * 0.7 + offset + timeOffset) * radius * 0.6;
        const z = Math.sin(time * speed * 0.3 + offset + timeOffset) * radius * 0.4;
        
        centers.push({x, y, z});
    }
    
    return centers;
}

// Listen for particle control changes from other windows
addEventListener("storage", (event) => {
    if (event.key === "particleControls") {
        const newControls = JSON.parse(event.newValue);
        Object.assign(particleControls, newControls);
        updateMaterialProperties();
    } else if (event.key === "rebuildParticles") {
        updateNumberOfParticleSystems();
    }
});

if (new URLSearchParams(window.location.search).get("clear"))
{
    localStorage.clear();
}
else
{	
    // this code is essential to circumvent that some browsers preload the content of some pages before you actually hit the url
    document.addEventListener("visibilitychange", () => 
    {
        if (document.visibilityState != 'hidden' && !initialized)
        {
            init();
        }
    });

    window.onload = () => {
        if (document.visibilityState != 'hidden')
        {
            init();
        }
    };

    function init ()
    {
        initialized = true;

        // add a short timeout because window.offsetX reports wrong values before a short period 
        setTimeout(() => {
            setupScene();
            setupWindowManager();
            resize();
            updateWindowShape(false);
            render();
            window.addEventListener('resize', resize);
        }, 500)	
    }

    function setupScene ()
    {
        camera = new t.OrthographicCamera(0, 0, window.innerWidth, window.innerHeight, -10000, 10000);
        
        camera.position.z = 2.5;
        near = camera.position.z - .5;
        far = camera.position.z + 0.5;

        scene = new t.Scene();
        scene.background = new t.Color(0.0);
        scene.add( camera );

        renderer = new t.WebGLRenderer({antialias: true, depthBuffer: true});
        renderer.setPixelRatio(pixR);
        
          world = new t.Object3D();
        scene.add(world);

        renderer.domElement.setAttribute("id", "scene");
        document.body.appendChild( renderer.domElement );

        // Load saved particle controls
        const savedControls = localStorage.getItem('particleControls');
        if (savedControls) {
            Object.assign(particleControls, JSON.parse(savedControls));
        }
    }

    function setupWindowManager ()
    {
        windowManager = new WindowManager();
        windowManager.setWinShapeChangeCallback(updateWindowShape);
        windowManager.setWinChangeCallback(windowsUpdated);

        // here you can add your custom metadata to each windows instance
        let metaData = {foo: "bar"};

        // this will init the windowmanager and add this window to the centralised pool of windows
        windowManager.init(metaData);

        // call update windows initially (it will later be called by the win change callback)
        windowsUpdated();
    }

    function windowsUpdated ()
    {
        updateNumberOfParticleSystems();
        // Create or remove control panel based on window position
        createControlPanel();
    }

    function updateNumberOfParticleSystems () // Changed from updateNumberOfCubes
    {
        let wins = windowManager.getWindows();

        // remove all particle systems
        particleSystems.forEach((ps) => {
            world.remove(ps);
            ps.geometry.dispose();
            ps.material.dispose();
        })

        particleSystems = [];

        // add new particle systems based on the current window setup
        for (let i = 0; i < wins.length; i++)
        {
            let win = wins[i];

            let c = new t.Color();
            c.setHSL(i * .1, 1.0, .5);

            // Create particle system using control values
            let particleCount = particleControls.count;
            let particles = new t.BufferGeometry();
            let positions = new Float32Array(particleCount * 3);
            let colors = new Float32Array(particleCount * 3);
            let velocities = new Float32Array(particleCount * 3);
            let targetCenters = new Float32Array(particleCount * 3); // Track which center each particle targets

            // Generate particles in a larger sphere around the window
            let size = 400 + i * 100;
            for (let j = 0; j < particleCount; j++) {
                // Create particles in a sphere distribution
                let radius = Math.random() * size;
                let theta = Math.random() * Math.PI * 2;
                let phi = Math.random() * Math.PI;

                let x = radius * Math.sin(phi) * Math.cos(theta);
                let y = radius * Math.sin(phi) * Math.sin(theta);
                let z = radius * Math.cos(phi);

                positions[j * 3] = x;
                positions[j * 3 + 1] = y;
                positions[j * 3 + 2] = z;

                // Assign particle to a random center point
                let centerIndex = Math.floor(Math.random() * particleControls.centerPoints);
                targetCenters[j * 3] = centerIndex;

                // Store initial velocities
                let speed = (0.5 + Math.random() * 2) * particleControls.speed;
                velocities[j * 3] = -x * speed * 0.005;
                velocities[j * 3 + 1] = -y * speed * 0.005;
                velocities[j * 3 + 2] = -z * speed * 0.005;

                colors[j * 3] = c.r;
                colors[j * 3 + 1] = c.g;
                colors[j * 3 + 2] = c.b;
            }

            particles.setAttribute('position', new t.BufferAttribute(positions, 3));
            particles.setAttribute('color', new t.BufferAttribute(colors, 3));
            particles.setAttribute('velocity', new t.BufferAttribute(velocities, 3));
            particles.setAttribute('targetCenter', new t.BufferAttribute(targetCenters, 3)); // Custom attribute

            let particleMaterial = new t.PointsMaterial({
                size: particleControls.size,
                vertexColors: true,
                transparent: true,
                opacity: particleControls.opacity,
                blending: t.AdditiveBlending
            });

            let particleSystem = new t.Points(particles, particleMaterial);
            particleSystem.position.x = win.shape.x + (win.shape.w * .5);
            particleSystem.position.y = win.shape.y + (win.shape.h * .5);

            world.add(particleSystem);
            particleSystems.push(particleSystem);
        }
    }

	function updateWindowShape (easing = true)
	{
		// storing the actual offset in a proxy that we update against in the render function
		sceneOffsetTarget = {x: -window.screenX, y: -window.screenY};
		if (!easing) sceneOffset = sceneOffsetTarget;
	}


	function render ()
	{
		let t = getTime();

		windowManager.update();

		// calculate the new position based on the delta between current offset and new offset times a falloff value (to create the nice smoothing effect)
		let falloff = .05;
		sceneOffset.x = sceneOffset.x + ((sceneOffsetTarget.x - sceneOffset.x) * falloff);
		sceneOffset.y = sceneOffset.y + ((sceneOffsetTarget.y - sceneOffset.y) * falloff);

		// set the world position to the offset
		world.position.x = sceneOffset.x;
		world.position.y = sceneOffset.y;

		let wins = windowManager.getWindows();

		// loop through all our particle systems and update their positions based on current window positions
		for (let i = 0; i < particleSystems.length; i++)
		{
			let particleSystem = particleSystems[i];
			let win = wins[i];
			let _t = t;

			let posTarget = {x: win.shape.x + (win.shape.w * .5), y: win.shape.y + (win.shape.h * .5)}

			particleSystem.position.x = particleSystem.position.x + (posTarget.x - particleSystem.position.x) * falloff;
			particleSystem.position.y = particleSystem.position.y + (posTarget.y - particleSystem.position.y) * falloff;
			particleSystem.rotation.x = _t * .1;
			particleSystem.rotation.y = _t * .05;

			// Get moving center points for this window
            const centerPoints = getCenterPoints(_t, i);

            // Animate particles moving toward their assigned center points
            let positions = particleSystem.geometry.attributes.position.array;
            let velocities = particleSystem.geometry.attributes.velocity.array;
            let targetCenters = particleSystem.geometry.attributes.targetCenter.array;
            
            for (let j = 0; j < positions.length; j += 3) {
                // Get the target center for this particle
                let centerIndex = Math.floor(targetCenters[j] % centerPoints.length);
                let targetCenter = centerPoints[centerIndex];

                // Update positions based on velocities
                positions[j] += velocities[j] * particleControls.speed;
                positions[j + 1] += velocities[j + 1] * particleControls.speed;
                positions[j + 2] += velocities[j + 2] * particleControls.speed;

                // Calculate direction to target center
                let dx = targetCenter.x - positions[j];
                let dy = targetCenter.y - positions[j + 1];
                let dz = targetCenter.z - positions[j + 2];
                let distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

                if (distance > 5) {
                    // Apply attraction to the moving center point
                    let attraction = particleControls.attraction;
                    velocities[j] += dx * attraction;
                    velocities[j + 1] += dy * attraction;
                    velocities[j + 2] += dz * attraction;
                } else {
                    // Reset particle when it gets too close to its target center
                    let resetRadius = particleControls.resetRadius + i * 50;
                    let theta = Math.random() * Math.PI * 2;
                    let phi = Math.random() * Math.PI;
                    
                    positions[j] = resetRadius * Math.sin(phi) * Math.cos(theta);
                    positions[j + 1] = resetRadius * Math.sin(phi) * Math.sin(theta);
                    positions[j + 2] = resetRadius * Math.cos(phi);
                    
                    // Reassign to a random center
                    targetCenters[j] = Math.floor(Math.random() * particleControls.centerPoints);
                    
                    let speed = (0.5 + Math.random() * 2) * particleControls.speed;
                    velocities[j] = -positions[j] * speed * 0.005;
                    velocities[j + 1] = -positions[j + 1] * speed * 0.005;
                    velocities[j + 2] = -positions[j + 2] * speed * 0.005;
                }
            }

            // Mark geometry as needing update
            particleSystem.geometry.attributes.position.needsUpdate = true;
            particleSystem.geometry.attributes.velocity.needsUpdate = true;
            particleSystem.geometry.attributes.targetCenter.needsUpdate = true;
        };

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }


	// resize the renderer to fit the window size
	function resize ()
	{
		let width = window.innerWidth;
		let height = window.innerHeight
		
		camera = new t.OrthographicCamera(0, width, 0, height, -10000, 10000);
		camera.updateProjectionMatrix();
		renderer.setSize( width, height );
	}
}