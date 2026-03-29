# Philips Hue integration for Remote Two/3

Unfolded Circle Remote integration driver for Philips Hue lights, supporting the Hue v2 API.
Supported Hue Bridges are the Hue Bridge generation 2 and the Hue Bridge Pro.

This integration driver is included in the Unfolded Circle Remote firmware and does not need to be run as an external
integration to control Hue lights. A standalone driver can be used for development or custom functionality.

The integration implements the UC Remote [Integration-API](https://github.com/unfoldedcircle/core-api) which
communicates with JSON messages over WebSocket.

> [!IMPORTANT]
> This driver is currently being rewritten using the Hue API v2 with event streaming.
>
> - The v1 Hue Bridge is no longer supported.
> - The new Hue Bridge Pro is supported with the v2 API.

## Hue v1 API migration

Integration versions < v0.3.0 used the Hue v1 API. Version 0.3.0 switched to the Hue v2 API.
This Philips Hue integration using the Hue v1 API was included in the Remote Two/3 firmware versions up to v2.9.0.

- The old configuration file is automatically migrated if a connection to the Hue Bridge can be established.
  - No bridge re-authentication is required unless the authentication fails.
- Already configured lights using the old v1 identifiers are still working (short numeric identifiers).
  - New lights will be created with the v2 identifiers (UUID identifiers).
  - It is recommended to reconfigure the lights to use the new format by removing them from the configured entities in
    the web-configurator. However, all UI-widgets and button mappings have to be re-created.

## Standalone usage

### Setup

Requirements:

- Remote Two/3 firmware 1.9.3 or newer with support for custom integrations.
- Install [nvm](https://github.com/nvm-sh/nvm) (Node.js version manager) for local development.
- Node.js v22.13 or newer (older versions are not tested).
- Install required libraries:

`npm install`

### Run

Build JavaScript from TypeScript:

```shell
npm run build
```

Run as an external integration driver:

```shell
UC_CONFIG_HOME=. UC_INTEGRATION_HTTP_PORT=8097 npm run start
```

The configuration files are loaded and saved from the path specified in the environment variable `UC_CONFIG_HOME`.

### Logging

Logging any kind of output is directed to the [debug](https://www.npmjs.com/package/debug) module.
To let the integration driver output anything, run the driver with the `DEBUG` environment variable set like:

```shell
DEBUG=uc_hue:* npm run start
```

The driver exposes the following log-levels:

Log namespaces:

- `uc_hue:msg`: Philips Hue API messages
- `uc_hue:debug`: debugging messages
- `uc_hue:info`: informational messages
- `uc_hue:warn`: warnings
- `uc_hue:error`: errors

If you only want to get errors and warnings reported:

```shell
DEBUG=uc_hue:warn,uc_hue:error npm run start
```

The [Unfolded Circle Integration-API library](https://github.com/unfoldedcircle/integration-node-library) is also using
the `debug` module for logging:

- Enable WebSocket message trace: `ucapi:msg`

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the
[tags and releases on this repository](https://github.com/unfoldedcircle/integration-philipshue/releases).

## Changelog

The major changes found in each new release are listed in the [changelog](CHANGELOG.md)
and under the GitHub [releases](https://github.com/unfoldedcircle/integration-philipshue/releases).

## Contributions

Please read our [contribution guidelines](CONTRIBUTING.md) before opening a pull request.

## License

This project is licensed under the [**Mozilla Public License 2.0**](https://choosealicense.com/licenses/mpl-2.0/).
See the [LICENSE](LICENSE) file for details.
