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

const BaseCommand = require('../../BaseCommand')
const yeoman = require('yeoman-environment')
const path = require('path')
const fs = require('fs-extra')
const aioLogger = require('@adobe/aio-lib-core-logging')('@adobe/aio-cli-plugin-app:init', { provider: 'debug' })
const { flags } = require('@oclif/command')
const { importConfigJson } = require('../../lib/import')

class InitCommand extends BaseCommand {
  async run () {
    const { args, flags } = this.parse(InitCommand)
    if (args.path !== '.') {
      const destDir = path.resolve(args.path)
      fs.ensureDirSync(destDir)
      process.chdir(destDir)
    }

    aioLogger.debug('creating new app with init command ', flags)

    let projectName = path.basename(process.cwd())
    let services = 'AdobeTargetSDK,AdobeAnalyticsSDK,CampaignSDK' // todo fetch those from console when no --import

    if (flags.import) {
      const config = fs.readJSONSync(flags.import)

      projectName = config.name // must be defined
      services = (config.services && config.services.map(s => s.sdkCode).join(',')) || ''
    }

    const env = yeoman.createEnv()

    this.log(`You are about to initialize the project '${projectName}'`)

    // call code generator
    env.register(require.resolve('@adobe/generator-aio-app'), 'gen')
    const res = await env.run('gen', {
      'skip-install': flags['skip-install'],
      'skip-prompt': flags.yes,
      'project-name': projectName,
      'adobe-services': services
    })

    // config import
    // todo do also when fetching from console
    if (flags.import) {
      const interactive = !!flags.yes
      const merge = true
      return importConfigJson(flags.import, process.cwd(), { interactive, merge })
    }

    // finalize configuration data
    this.log('✔ App initialization finished!')
    return res
  }
}

InitCommand.description = `Create a new Adobe I/O App
`

InitCommand.flags = {
  yes: flags.boolean({
    description: 'Skip questions, and use all default values',
    default: false,
    char: 'y'
  }),
  'skip-install': flags.boolean({
    description: 'Skip npm installation after files are created',
    default: false
  }),
  import: flags.boolean({
    description: 'Import an Adobe I/O Console config file',
    default: '',
    type: String
  }),
  ...BaseCommand.flags
}

InitCommand.args = [
  {
    name: 'path',
    description: 'Path to the app directory',
    default: '.'
  }
]

module.exports = InitCommand
