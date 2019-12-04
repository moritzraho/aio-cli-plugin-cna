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
const debug = require('debug')('aio-cli-plugin-app:init')
const { flags } = require('@oclif/command')
const inquirer = require('inquirer')

class InitCommand extends BaseCommand {
  async run () {
    const { args, flags } = this.parse(InitCommand)
    if (args.path !== '.') {
      const destDir = path.resolve(args.path)
      fs.ensureDirSync(destDir)
      process.chdir(destDir)
    }
    debug('creating new app with init command ', flags)

    const env = yeoman.createEnv()
    // finds and loads all installed generators into yeoman environment
    await new Promise((resolve, reject) => env.lookup(err => {
      if (err) reject(err)
      resolve()
    }))
    env.alias(/^([a-zA-Z0-9:*]+)$/, 'aio-app-$1')

    let template = flags.template
    if (!template) {
      if (flags.yes) {
        template = 'base:hello'
      } else {
        const installedGenerators = env.getGeneratorsMeta()
        const responses = await inquirer.prompt([{
          name: 'template',
          message: 'select a starter template',
          type: 'list',
          choices: Object.keys(installedGenerators)
            .filter(name => name.startsWith('aio-app'))
            .map(name => ({ name: name.split('aio-app-')[1] }))
        }])
        template = responses.template
      }
    }

    const res = await env.run(template, { skip_prompt: flags.yes })
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
  template: flags.string({
    description: 'App starter template name',
    char: 't'
  }),
  // todo support this
  // 'template-path': flags.string({
  //   description: 'Path to an app starter template',
  //   char: 'p'
  // }),
  // instead of lookup and get, yeoman-env logic would be something like this
  // try {
  //   env.register(require.resolve(path), 'gen')
  // } catch (err) {
  //   this.error(`the '${flags.template}' template is not available.`)
  // }
  // const res = await env.run('gen', { skip_prompt: flags.yes })
  ...BaseCommand.flags
}

InitCommand.args = [
  ...BaseCommand.args
]

module.exports = InitCommand
