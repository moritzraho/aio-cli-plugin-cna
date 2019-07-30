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

const { flags } = require('@oclif/command')
const CNABaseCommand = require('../../CNABaseCommand')
const ora = require('ora')
const chalk = require('chalk')

class CNARun extends CNABaseCommand {
  async run () {
    const { flags } = this.parse(CNARun)

    const spinner = ora()
    const listeners = {
      onStart: taskName => {
        this.log(chalk.bold(`> ${taskName}`))
        spinner.start(taskName)
      },
      onEnd: taskName => {
        spinner.succeed(chalk.green(taskName))
        this.log()
      },
      onWarning: warning => {
        spinner.warn(chalk.dim(chalk.yellow(warning)))
        spinner.start()
      },
      onProgress: info => {
        spinner.info(chalk.dim(info))
        spinner.start()
      }
    }
    if (flags.verbose) {
      listeners.onProgress = item => {
        spinner.stopAndPersist({ text: chalk.dim(` > ${item}`) })
        spinner.start()
      }
    }

    process.env['REMOTE_ACTIONS'] = !flags.local

    const scripts = require('@adobe/io-cna-scripts')({ listeners })
    scripts.runDev()
  }
}

CNARun.description = `Run a Cloud Native Application
`

CNARun.flags = {
  'local': flags.boolean({
    description: 'run/debug actions locally',
    default: false
  }),
  ...CNABaseCommand.flags
}

// CNARun.args = [
//   ...CNABaseCommand.args
// ]

module.exports = CNARun
