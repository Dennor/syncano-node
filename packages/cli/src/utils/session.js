import Syncano from '@syncano/core'
import _ from 'lodash'
import fs from 'fs'
import format from 'chalk'
import path from 'path'
import mkdirp from 'mkdirp'
import walkUp from 'node-walkup'
import Promise from 'bluebird'

import logger from './debug'
import pjson from '../../package.json'
import getSettings from '../settings'
import genUniqueName from './unique-instance'
import Socket from './sockets'
import Init from './init'
import Hosting from './hosting'
import Plugins from './plugins'
import { echo } from './print-tools'

const { debug } = logger('utils-session')

export class Session {
  constructor () {
    this.settings = null
    this.projectPath = null
    this.project = null
    this.userId = null
    this.walkup = Promise.promisify(walkUp)

    this.majorVersion = pjson.version.split('.')[0]

    this.HOST = process.env.SYNCANO_HOST || 'api.syncano.io'
    this.ENDPOINT_HOST = this.HOST === 'api.syncano.io' ? 'syncano.space' : 'syncano.link'
  }

  getSpaceHost () {
    if (this.project && this.project.instance) {
      return `${this.project.instance}.${this.ENDPOINT_HOST}`
    }
  }

  getInitInstance () {
    return new Init(this)
  }

  getPluginsInstance () {
    return new Plugins(this)
  }

  getBaseURL () {
    return `https://${this.getHost()}`
  }

  getHost () {
    return this.HOST
  }

  getDistPath () {
    let distPath = '.dist'
    if (this.projectPath) {
      distPath = path.join(this.projectPath, '.dist')
    }
    mkdirp.sync(distPath)
    return distPath
  }

  getBuildPath () {
    const buildPath = path.join(this.projectPath, '.build')
    mkdirp.sync(buildPath)
    return buildPath
  }

  getAnonymousConnection () {
    return new Syncano({
      meta: {
        'api_host': this.getHost()
      }
    })
  }

  async createConnection () {
    debug('createConnection')
    if (this.settings.account.authenticated()) {
      debug('user is authenticated')
      this.connection = new Syncano({
        accountKey: this.settings.account.getAuthKey(),
        meta: {
          'api_host': this.getHost()
        }
      })

      if (this.project && this.project.instance) {
        this.connection = new Syncano({
          instanceName: this.project.instance,
          accountKey: this.settings.account.getAuthKey(),
          meta: {
            'api_host': this.getHost()
          }
        })
      }
    } else {
      this.connection = this.getAnonymousConnection()
    }

    try {
      const details = await this.connection.account.get(this.settings.account.getAuthKey())
      this.userId = details.id
    } catch (err) {}
  }

  async deleteInstance (name) {
    return this.connection.instance.delete(name)
  }

  async createInstance (name = genUniqueName()) {
    return this.connection.instance.create({ name })
  }

  async getInstance (instanceName) {
    const instanceNameToGet = instanceName || (this.project && this.project.instance)
    return this.connection.instance.get(instanceNameToGet)
  }

  async getInstances () {
    return this.connection.instance.list()
  }

  async checkAuth () {
    const userDetails = await this.connection.Account.getUserDetails()
    return new Promise((resolve, reject) => {
      if (userDetails) {
        return resolve(userDetails)
      }
      reject(new Error('No such user!'))
    })
  }

  static findProjectPath () {
    return new Promise((resolve, reject) => {
      if (fs.existsSync('syncano.yml')) {
        return resolve(process.cwd())
      }
      if (fs.existsSync('syncano/syncano.yml')) {
        return resolve(path.join(process.cwd(), 'syncano'))
      }

      const searchInPath = (pathToCheck) => {
        if (pathToCheck === process.env.HOME || pathToCheck === '/') {
          return reject(new Error('No more folders to check'))
        }

        let files = null
        try {
          files = fs.readdirSync(pathToCheck)
        } catch (err) {
          return reject(new Error(`Path ${pathToCheck} can not be read`))
        }

        if (_.includes(files, 'syncano.yml')) {
          return resolve(pathToCheck)
        }

        const nextFolder = path.parse(pathToCheck)
        if (nextFolder.name) {
          searchInPath(nextFolder.dir)
        } else {
          return reject(new Error('No more folders to check'))
        }
      }

      searchInPath(process.cwd())
    })
  }

  async load () {
    debug('load')

    // Checking all folders up
    try {
      const projectPath = await Session.findProjectPath()
      debug('Searching for syncano.yml', projectPath)
      this.projectPath = projectPath
      this.settings = getSettings(projectPath)
      this.project = this.settings.account.getProject(this.projectPath)
    } catch (err) {
      this.settings = getSettings()
    }
    await this.createConnection()
    return this
  }

  loadPlugins (program, context) {
    new Plugins(this).load(program, context)
  }

  isAuthenticated () {
    if (!this.settings.account.authenticated()) {
      echo()
      echo(4)('You are not logged in!')
      echo(4)(`Type ${format.cyan('syncano-cli login')} for login to your account.`)
      echo()
      process.exit(1)
    }
  }

  isAuthenticatedToInit () {
    if (!this.settings.account.authenticated()) {
      echo()
      echo(4)(format.red('You have to be a logged in to be able an initialize a new project!'))
      echo()
    }
  }

  async checkConnection (instanceName) {
    let instance

    try {
      instance = await this.getInstance(instanceName)
    } catch (err) {
      debug(err.message)
      if (err.message === 'Not found.') {
        echo()
        echo(4)(`Instance ${format.cyan(instanceName || this.project.instance)} was not found on your account!`)
        echo()

        if (instanceName) return process.exit()

        echo(4)(`Type ${format.cyan('syncano-cli attach')} to choose one of the existing instances.`)
        echo()
      }
      process.exit(1)
    }

    return instance
  }

  hasProject () {
    this.hasProjectPath()

    if (!this.project) {
      echo()
      echo(4)('You have to attach this project to one of your instances.')
      echo(4)(`Try ${format.cyan('syncano-cli attach')}.`)
      echo()
      process.exit()
    }
  }

  hasProjectPath () {
    if (!this.projectPath) {
      echo()
      echo(4)(`I don't see any project here. Try ${format.cyan('syncano-cli init')}.`)
      echo()
      process.exit()
    }
  }

  hasSocket (socketName) { // eslint-disable-line class-methods-use-this
    const socket = new Socket(socketName)
    if (!socket.existLocally) {
      echo()
      echo(4)('File socket.yml was not found in a project directory!')
      echo(4)(`Check your directory or try ${format.cyan('syncano-cli create')} to create a new Socket.`)
      echo()
      process.exit()
    }
  }

  notAlreadyInitialized () {
    if (this.projectPath && this.project) {
      echo()
      echo(4)('You are fine! Project in this folder is already initiated!')
      echo(4)(`It is using ${format.cyan(this.project.instance)} Syncano instance.`)
      echo()
      process.exit()
    }
  }

  async deployProject () { // eslint-disable-line class-methods-use-this
    const hostings = await Hosting.list()
    return Promise.all(hostings.map((hosting) => hosting.deploy()))
  }
}

export default new Session()
