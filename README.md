# SensorShadow Class for Cesium
This repository contains the `SensorShadow` class for Cesium.js, a JavaScript library for creating 3D maps and globes in a web browser. The `SensorShadow` class allows you to create, update, and manage sensor shadow entities, including sensor shadow visualization, color coding, frustum support, and many more.

## Screenshot

<img src="https://github.com/DigitalArsenal/SensorShadow/assets/749096/a3c64e59-d815-4d15-b1bd-cc7d9d8cc59d" width="40%" />


## Features

The `SensorShadow` class includes the following features:

- Ability to define and visualize sensor shadows in a 3D scene.
- Configurable camera position and view position.
- Configurable color for visible and hidden areas of the sensor shadow.
- Configurable alpha value for the sensor shadow.
- Support for frustum.
- Configurable size of the sensor shadow.
- Depth bias support.
- Ability to add pre-update listener functions.

## Installation

This class requires the Cesium.js library. You need to install Cesium.js and import the SensorShadow class into your project.

Please refer to the official [Cesium.js Installation Guide](https://cesium.com/docs/tutorials/quick-start/) for more information on how to install and set up Cesium.js.

## Usage

To create a new SensorShadow instance, you need a reference to the Cesium viewer instance and an optional configuration object. The configuration object can include various properties like `cameraPosition`, `viewPosition`, `viewAreaColor`, `shadowAreaColor`, `alpha`, `frustum`, `size` and `depthBias`.

Below is an example of how to create a new SensorShadow instance:

```javascript
let sensorShadow = new SensorShadow(viewer, {
  cameraPosition: new Cartesian3(0, 0, 0),
  viewPosition: new Cartesian3(1, 1, 1),
  viewAreaColor: new Color(0, 1, 0),
  shadowAreaColor: new Color(1, 0, 0),
  alpha: 0.5,
  frustum: true,
  size: 512,
});
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. Please make sure to update tests as appropriate.

## License

### [Apache 2.0](https://choosealicense.com/licenses/apache-2.0/)
