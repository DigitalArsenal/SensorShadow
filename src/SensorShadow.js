import defaultValue from "@cesium/engine/Source/Core/defaultValue";
import Color from "@cesium/engine/Source/Core/Color";
import Camera from "@cesium/engine/Source/Scene/Camera";
import PerspectiveFrustum from "@cesium/engine/Source/Core/PerspectiveFrustum";
import CesiumMath from "@cesium/engine/Source/Core/Math";
import ShadowMap from "@cesium/engine/Source/Scene/ShadowMap";
import {
  PositionProperty,
  ConstantPositionProperty,
  Cartesian2,
  Cartesian3,
  Cartesian4,
  EllipsoidTerrainProvider,
} from "@cesium/engine";
import PostProcessStage from "@cesium/engine/Source/Scene/PostProcessStage";
import ViewShead3D_FS from "./SensorShadow.fragment.shader.glsl";
import DeveloperError from "@cesium/engine/Source/Core/DeveloperError";

const defaultValues = {
  cameraPosition: new ConstantPositionProperty(),
  viewPosition: new ConstantPositionProperty(),
  viewAreaColor: new Color(0, 1, 0),
  shadowAreaColor: new Color(1, 0, 0),
  alpha: 0.5,
  frustum: true,
  size: 4096,
  depthBias: 2e-12,
};

/**
 * SensorShadow Class.
 * This class handles the creation, update and management of sensor shadow entities.
 *
 * @property {Object} viewer - A reference to the Cesium viewer instance.
 * @property {ConstantPositionProperty|PositionProperty|Cartesian3} cameraPosition - The camera position.
 * @property {ConstantPositionProperty|PositionProperty|Cartesian3} viewPosition - The view position.
 * @property {Color} viewAreaColor - The color of the visible area of the sensor shadow.
 * @property {Color} shadowAreaColor - The color of the hidden area of the sensor shadow.
 * @property {number} alpha - The alpha value for the sensor shadow.
 * @property {boolean} frustum - Whether the frustum is enabled.
 * @property {number} size - The size of the sensor shadow.
 */
class SensorShadow {
    /**
     * Constructs a new SensorShadow instance.
     *
     * @param {Object} viewer - A reference to the Cesium viewer instance.
     * @param {Object} options - An optional configuration object.
     *
     * @example
     * let sensorShadow = new SensorShadow(viewer, {
     *   cameraPosition: new Cartesian3(0, 0, 0),
     *   viewPosition: new Cartesian3(1, 1, 1),
     *   viewAreaColor: new Color(0, 1, 0),
     *   shadowAreaColor: new Color(1, 0, 0),
     *   alpha: 0.5,
     *   frustum: true,
     *   size: 512
     * });
     */
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this._isDestroyed = false;

        this.cameraPosition =
            typeof options.cameraPosition.getValue === "function"
                ? options.cameraPosition
                : new ConstantPositionProperty(options.cameraPosition);

        this.viewPosition =
            typeof options.viewPosition.getValue === "function"
                ? options.viewPosition
                : new ConstantPositionProperty(options.viewPosition);

        this.viewAreaColor = defaultValue(
            options.viewAreaColor,
            defaultValues.viewAreaColor
        );

        this.shadowAreaColor = defaultValue(
            options.shadowAreaColor,
            defaultValues.shadowAreaColor
        );

        this.alpha = defaultValue(options.alpha, defaultValues.alpha);
        this.size = defaultValue(options.size, defaultValues.size);
        this.frustum = defaultValue(options.frustum, defaultValues.frustum);
        this.depthBias = defaultValue(options.depthBias, defaultValues.depthBias);

        this.preUpdateListener = null;

        if (this.cameraPosition && this.viewPosition) {
            this._addToScene();
        }
    }

    /**
     * Get the actual position of the camera.
     * This method calculates the position vector based on the current time.
     *
     * @private
     * @returns {Cartesian3} The calculated camera position vector.
     */
    get _getVectors() {
        let positionVector = this.cameraPosition.getValue(
            this.viewer.clock.currentTime
        );
        let viewVector = this.viewPosition.getValue(this.viewer.clock.currentTime);
        let distanceBetweenVectors = Number(
            Cartesian3.distance(viewVector, positionVector).toFixed(1)
        );

        if (distanceBetweenVectors > 10000) {
            let multiple = 1 - 10000 / distanceBetweenVectors;
            positionVector = Cartesian3.lerp(
                positionVector,
                viewVector,
                multiple,
                new Cartesian3()
            );
        }

        return { positionVector, viewVector };
    }

    destroy() {
        // If a pre-update listener was added, remove it
        if (this.preUpdateListener) {
            this.viewer.scene.preUpdate.removeEventListener(this.preUpdateListener);
            this.preUpdateListener = null;
        }

        // If there's a shadow map, dispose of it
        if (this.viewShadowMap) {
            this.viewShadowMap.dispose();
            this.viewShadowMap = null;
        }

        // Remove the post-process stage if it has been added
        if (this.postProcess) {
            this.viewer.scene.postProcessStages.remove(this.postProcess);
            this.postProcess = null;
        }

        // Remove this object from the scene primitives if it has been added
        this.viewer.scene.primitives.remove(this);

        // Explicitly remove references to potentially large objects to assist with garbage collection
        for (let property in this) {
            if (this.hasOwnProperty(property)) {
                delete this[property];
            }
        }

        // Set the destroyed flag
        this._isDestroyed = true;
    }

    isDestroyed() {
        // Return the destroyed status
        return this._isDestroyed;
    }


    /**
     * Adds the SensorShadow to the scene.
     *
     * @private
     */
    _addToScene() {
        this._createShadowMap();
        this._addPostProcess();

        this.viewer.scene.primitives.add(this);

    }

    /**
     * Creates the shadow map.
     *
     * @private
     */
    _createShadowMap(updateOnly) {
        let { positionVector, viewVector } = this._getVectors;

        const distance = Number(
            Cartesian3.distance(viewVector, positionVector).toFixed(1)
        );

        if (distance > 10000) {
            const multiple = 1 - 10000 / distance;
            positionVector = Cartesian3.lerp(
                positionVector,
                viewVector,
                multiple,
                new Cartesian3()
            );
        }

        const scene = this.viewer.scene;

        const camera = new Camera(scene);

        camera.position = positionVector;

        camera.direction = Cartesian3.subtract(
            viewVector,
            positionVector,
            new Cartesian3(0, 0, 0)
        );

        camera.up = Cartesian3.normalize(positionVector, new Cartesian3(0, 0, 0));

        camera.frustum = new PerspectiveFrustum({
            fov: CesiumMath.toRadians(120),
            aspectRatio: scene.canvas.clientWidth / scene.canvas.clientHeight,
            near: 0.1,
            far: distance,
        });

        if (!updateOnly) {
            this.viewShadowMap = new ShadowMap({
                lightCamera: camera,
                enable: true,
                isPointLight: false,
                isSpotLight: true,
                cascadesEnabled: false,
                context: scene.context,
                size: this.size,
                pointLightRadius: distance,
                fromLightSource: false,
                maximumDistance: distance,
            });
        } else {
            this.viewShadowMap._lightCamera.position = positionVector;
        }

        this.viewShadowMap.normalOffset = true;
        this.viewShadowMap._terrainBias.depthBias = 0.0;
    }

    /**
     * Adds post processing to the SensorShadow.
     *
     * @private
     */
    _addPostProcess() {
        const SensorShadow = this;

        const viewShadowMap = this.viewShadowMap;
        const primitiveBias = viewShadowMap._isPointLight
            ? viewShadowMap._pointBias
            : viewShadowMap._primitiveBias;
        this.postProcess = this.viewer.scene.postProcessStages.add(
            new PostProcessStage({
                fragmentShader: fsShader,
                uniforms: {
                    view_distance: function () {
                        return SensorShadow.distance;
                    },
                    viewArea_color: function () {
                        return SensorShadow.viewAreaColor;
                    },
                    shadowArea_color: function () {
                        return SensorShadow.shadowAreaColor;
                    },
                    percentShade: function () {
                        return SensorShadow.alpha;
                    },
                    shadowMap: function () {
                        return viewShadowMap._shadowMapTexture;
                    },
                    _shadowMap_cascadeSplits: function () {
                        return viewShadowMap._cascadeSplits;
                    },
                    _shadowMap_cascadeMatrices: function () {
                        return viewShadowMap._cascadeMatrices;
                    },
                    _shadowMap_cascadeDistances: function () {
                        return viewShadowMap._cascadeDistances;
                    },
                    shadowMap_matrix: function () {
                        return viewShadowMap._shadowMapMatrix;
                    },
                    shadowMap_camera_positionEC: function () {
                        return viewShadowMap._lightPositionEC;
                    },
                    shadowMap_camera_directionEC: function () {
                        return viewShadowMap._lightDirectionEC;
                    },
                    cameraPosition_WC: function () {
                        return SensorShadow.viewer.camera.positionWC;
                    },
                    viewPosition_WC: function () {
                        return SensorShadow.viewPosition.getValue(
                            SensorShadow.viewer.clock.currentTime
                        );
                    },
                    shadowMap_camera_up: function () {
                        return viewShadowMap._lightCamera.up;
                    },
                    shadowMap_camera_dir: function () {
                        return viewShadowMap._lightCamera.direction;
                    },
                    shadowMap_camera_right: function () {
                        return viewShadowMap._lightCamera.right;
                    },
                    ellipsoidInverseRadii: function () {
                        let radii = SensorShadow.viewer.scene.globe.ellipsoid.radii;
                        return new Cartesian3(1 / radii.x, 1 / radii.y, 1 / radii.z);
                    },
                    shadowMap_texelSizeDepthBiasAndNormalShadingSmooth: function () {
                        var viewShed2D = new Cartesian2();
                        viewShed2D.x = 1 / viewShadowMap._textureSize.x;
                        viewShed2D.y = 1 / viewShadowMap._textureSize.y;

                        return Cartesian4.fromElements(
                            viewShed2D.x,
                            viewShed2D.y,
                            this.depthBias,
                            primitiveBias.normalShadingSmooth,
                            this.combinedUniforms1
                        );
                    },
                    shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness:
                        function () {
                            return Cartesian4.fromElements(
                                primitiveBias.normalOffsetScale,
                                viewShadowMap._distance,
                                viewShadowMap.maximumDistance,
                                viewShadowMap._darkness,
                                this.combinedUniforms2
                            );
                        },
                    exclude_terrain: function () {
                        return (
                            SensorShadow.viewer.terrainProvider instanceof
                            EllipsoidTerrainProvider
                        );
                    },
                },
            })
        );

        // If a previous listener was added, remove it
        if (this.preUpdateListener) {
            viewer.scene.preUpdate.removeEventListener(this.preUpdateListener);
        }

        // Add a new listener
        this.preUpdateListener = () => {
            if (!this.viewShadowMap._shadowMapTexture) {
                this.postProcess.enabled = false;
            } else {
                this.postProcess.enabled = true;
            }
        };

        viewer.scene.preUpdate.addEventListener(this.preUpdateListener);
    }

    update(frameState) {
        this._createShadowMap(true);
        frameState.shadowMaps.push(this.viewShadowMap);
    }

    destroy() {
        if (this.preUpdateListener) {
            viewer.scene.preUpdate.removeEventListener(this.preUpdateListener);
        }
        this.viewer.scene.postProcessStages.remove(this.postProcess);
        for (let property in this) {
            if (this.hasOwnProperty(property)) {
                delete this[property];
            }
        }
    }

    get size() {
        return this._size;
    }

    set size(v) {
        this._size = v;
    }

    get depthBias() {
        return this._depthBias;
    }

    set depthBias(v) {
        this._depthBias = v;
    }

    get cameraPosition() {
        return this._cameraPosition;
    }

    set cameraPosition(v) {
        this._cameraPosition = v;
    }

    get viewPosition() {
        return this._viewPosition;
    }

    set viewPosition(v) {
        this._viewPosition = v;
    }

    get frustum() {
        return this._frustum;
    }

    set frustum(v) {
        this._frustum = v;
    }

    get distance() {
        return this._distance;
    }

    set distance(v) {
        this._distance = v;
    }

    get viewAreaColor() {
        return this._viewAreaColor;
    }

    set viewAreaColor(v) {
        this._viewAreaColor = v;
    }

    get shadowAreaColor() {
        return this._shadowAreaColor;
    }

    set shadowAreaColor(v) {
        this._shadowAreaColor = v;
    }

    get alpha() {
        return this._alpha;
    }

    set alpha(v) {
        this._alpha = v;
    }
}

export default SensorShadow;
