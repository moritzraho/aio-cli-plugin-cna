/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs-extra')
const chalk = require('chalk')
const utils = require('./app-helper')
const aioConfigLoader = require('@adobe/aio-lib-core-config')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app:config-loader', { provider: 'debug' })

// defaults
const {
  defaultAppHostname,
  defaultTvmUrl,
  defaultOwApihost,
  defaultHTMLCacheDuration,
  defaultJSCacheDuration,
  defaultCSSCacheDuration,
  defaultImageCacheDuration,
  AIO_CONFIG_IMS_ORG_ID,
  stageAppHostname
} = require('./defaults')

const {
  getCliEnv, /* function */
  STAGE_ENV /* string */
} = require('@adobe/aio-lib-env')

/**
 * loading config returns following object (this config is internal, not user facing):
 *  {
 *    extensionPoints: {Manifest}
 *    extensionPointsConfig: {
 *      'aem/nui/1': {
 *        app: {
 *          name,
 *          version,
 *          hasFrontend,
 *          hasBackend,
 *          dist
 *        },
 *        ow: {
 *          apihost,
 *          apiversion,
 *          auth,
 *          namespace,
 *          package
 *        },
 *        s3: {
 *          creds || tvmUrl,
 *          credsCacheFile,
 *          folder,
 *        },
 *        web: {
 *          src,
 *          injectedConfig,
 *          distDev,
 *          distProd,
 *        },
 *        manifest: {
 *          full,
 *          package,
 *          packagePlaceholder,
 *          src,
 *        },
 *        actions: {
 *          src,
 *          dist,
 *          remote,
 *          urls
 *        }
 *      }
 *    }
 *  }
 */

module.exports = () => {
  // load aio config
  aioConfigLoader.reload()
  const aioConfig = aioConfigLoader.get() || {}

  // load top level config
  const topConfig = loadTopConfig(aioConfig)

  // load all extension point local configs
  const extensionPointsConfig = loadAllExtConfigs(aioConfig, topConfig)

  const config = {
    extensionPoints: topConfig.extensionPoints,
    extensionPointsConfig,
    aioConfig,
    root: process.cwd()
  }

  return config
}

/**
 * @param aioConfig
 */
function loadTopConfig (aioConfig) {
  let userConfig = loadUserConfig('./app.config.yaml')
  if (aioConfig.cna !== undefined || aioConfig.app !== undefined) {
    aioLogger.warn(chalk.redBright(chalk.bold('Setting application configuration in the \'.aio\' file has been deprecated. Please move your \'.aio.app\' or \'.aio.cna\' to \'app.config.yaml\'.')))
    aioConfig.app = { ...aioConfig.app, ...aioConfig.cna }
  }
  // TODO Consider changing deprecation notice to use `aioConfig`
  // TODO merge deeplevel
  // TODO include legacy hooks, manifest and env ?
  userConfig = { ...aioConfig.app, ...userConfig }

  const packagejson = loadPackageJson()

  const appConfig = {
    name: getModuleName(packagejson) || 'unnamed-app',
    version: packagejson.version || '0.1.0'
  }

  const owConfig = aioConfig.runtime || {}
  owConfig.defaultApihost = defaultOwApihost
  owConfig.apihost = owConfig.apihost || defaultOwApihost // set by user
  owConfig.apiversion = owConfig.apiversion || 'v1'
  owConfig.package = `${appConfig.name}-${appConfig.version}`

  // todo env ?
  return {
    ...userConfig,
    packagejson,
    ow: owConfig,
    extensionPoints: userConfig.extensionPoints || {},
    aioConfig,
    // soon not needed anymore (for old headless validator)
    imsOrgId: aioConfigLoader.get(AIO_CONFIG_IMS_ORG_ID),
    app: appConfig
  }
}

/**
 * @param aioConfig
 * @param topUserConfig
 */
function loadAllExtConfigs (aioConfig, topUserConfig) {
  const config = {}
  const extensionPoints = topUserConfig.extensionPoints || {}

  Object.entries(extensionPoints).forEach(([k, v]) => {
    let extensionName = k
    // clean up
    if (extensionName.endsWith('/')) {
      extensionName = extensionName.slice(0, -1)
    }
    if (extensionName.startsWith('/')) {
      extensionName = extensionName.slice(1)
    }
    const extConfigPath = v.config
    const extFolderPath = path.dirname(v.config)
    const extUserConfig = loadUserConfig(extConfigPath)
    config[extensionName] = setFullExtConfig(extFolderPath, extUserConfig, topUserConfig)
  })
  // todo support root case for backwards compat if no default nor extensionPointConfig

  // todo set default into the extensionPoint config
  return config
}

/**
 * @param folder
 * @param extUserConfig
 * @param aioConfig
 * @param topUserConfig
 */
function setFullExtConfig (folder, extUserConfig, topUserConfig) {
  const absRoot = p => path.join(process.cwd(), p)
  const pathToExtFolder = absRoot(folder)
  const absExt = p => path.join(pathToExtFolder, p)

  const config = {
    app: {},
    ow: {},
    s3: {},
    web: {},
    manifest: {},
    actions: {},
    // root of the ext folder
    root: pathToExtFolder,
    // root of the app folder
    appRoot: process.cwd()
  }
  // TODO redefine what can be set in top config and what in ext config
  // TODO should we name app.config.yaml and ext.config.yaml to do a difference ?

  const extName = folder

  // specific to extension, cannot be overwritten by top config
  const actions = path.normalize(extUserConfig.actions || 'actions')
  const web = path.normalize(extUserConfig.web || 'web-src')
  config.actions.src = absExt(actions)
  config.web.src = absExt(web)
  config.web.injectedConfig = absExt(path.join(web, 'src', 'config.json'))
  config.manifest = loadRuntimeManifest(extUserConfig)
  config.app.hasBackend = !!config.manifest.full
  config.app.hasFrontend = fs.existsSync(config.web.src)

  // can be shared and set by top config
  const sharedConfig = { ...extUserConfig, ...topUserConfig }
  if (sharedConfig.awsaccesskeyid &&
    sharedConfig.awssecretaccesskey &&
    sharedConfig.s3bucket) {
    config.s3.creds = {
      accessKeyId: sharedConfig.awsaccesskeyid,
      secretAccessKey: sharedConfig.awssecretaccesskey,
      params: { Bucket: sharedConfig.s3bucket }
    }
  }
  if (sharedConfig.tvmurl !== defaultTvmUrl) {
    // Legacy applications set the defaultTvmUrl in .env, so we need to ignore it to not
    // consider it as custom. The default will be set downstream by aio-lib-core-tvm.
    config.s3.tvmUrl = sharedConfig.tvmurl
  }
  config.app.defaultHostname = getCliEnv() === STAGE_ENV ? stageAppHostname : defaultAppHostname
  config.app.hostname = sharedConfig.hostname || defaultAppHostname
  config.app.htmlCacheDuration = sharedConfig.htmlcacheduration || defaultHTMLCacheDuration
  config.app.jsCacheDuration = sharedConfig.jscacheduration || defaultJSCacheDuration
  config.app.cssCacheDuration = sharedConfig.csscacheduration || defaultCSSCacheDuration
  config.app.imageCacheDuration = sharedConfig.imagecacheduration || defaultImageCacheDuration
  config.hooks = { ...topUserConfig.hooks, ...extUserConfig.hooks }
  // todo env

  // set in root folder only
  const dist = path.normalize(topUserConfig.dist || 'dist')
  config.app.dist = dist
  config.actions.dist = absRoot(path.join(dist, extName, actions))
  config.web.distDev = absRoot(path.join(dist, extName, `${web}-dev`))
  config.web.distProd = absRoot(path.join(dist, extName, `${web}-prod`))
  config.s3.credsCacheFile = absRoot('.aws.tmp.creds.json')
  config.ow = topUserConfig.ow
  config.s3.folder = config.ow.namespace
  config.imsOrgId = topUserConfig.imsOrgId
  config.app.name = topUserConfig.app.name
  config.app.version = topUserConfig.app.version

  return config
}

/**
 * @param folder
 */
function loadUserConfig (configFile) {
  // TODO there should be a function in aio-lib-core-config that allows to load a file by its name to support both yaml and hjson
  if (fs.existsSync(configFile)) {
    return yaml.safeLoad(fs.readFileSync(configFile, 'utf8'))
  }
  return {}
}

/**
 * @param userConfig
 */
function loadRuntimeManifest (userConfig) {
  // TODO do not set src if specified in userConfig.runtimeManifest
  const manifestConfig = { src: 'manifest.yml' }
  if (userConfig.runtimeManifest) {
    manifestConfig.full = userConfig.runtimeManifest
  } else if (fs.existsSync(manifestConfig.src)) {
    manifestConfig.full = yaml.safeLoad(fs.readFileSync(manifestConfig.src, 'utf8'))
  } else {
    // no backend
    return manifestConfig
  }
  manifestConfig.packagePlaceholder = '__APP_PACKAGE__'
  manifestConfig.package = manifestConfig.full.packages[manifestConfig.packagePlaceholder]
  if (manifestConfig.package) {
    aioLogger.debug(`Use of ${manifestConfig.packagePlaceholder} in manifest.yml.`)
  }
  // Note: we should set the config.manifest.package also if it's not using a placeholder
  return manifestConfig
}

function loadPackageJson () {
  aioLogger.debug('checking package.json existence')
  utils.checkFile('package.json')
  return JSON.parse(fs.readFileSync('package.json'))
}

/** @private */
function getModuleName (packagejson) {
  if (packagejson && packagejson.name) {
    // turn "@company/myaction" into "myaction"
    // OpenWhisk does not allow `@` or `/` in an entity name
    return packagejson.name.split('/').pop()
  }
}
