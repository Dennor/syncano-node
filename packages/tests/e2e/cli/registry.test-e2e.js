/* global describe it before after */
import replace from 'replace'
import path from 'path'
import {
  nixt,
  testsLocation,
  deleteInstance,
  createProject,
  uniqueInstance,
  getRandomString,
  createdSocketName,
  randomKey
} from '@syncano/test-tools'

import {cliLocation, projectTestTemplate} from '../utils'

describe('CLI Registry', function () {
  let testInstance = uniqueInstance()

  const testNixt = () => nixt()
    .env('SYNCANO_PROJECT_INSTANCE', testInstance)
    .env('SYNCANO_AUTH_KEY', process.env.E2E_CLI_ACCOUNT_KEY)
    .cwd(path.join(testsLocation, testInstance))

  before(async () => createProject(testInstance, projectTestTemplate))
  after(async () => deleteInstance(testInstance))

  it('can search for non-existing socket', function (done) {
    testNixt()
      .run(`${cliLocation} search ${getRandomString()}`)
      .stdout(/No sockets found/)
      .code(0)
      .end(done)
  })

  it('can create new socket', function (done) {
    testNixt()
      .run(`${cliLocation} create ${createdSocketName}`)
      .on(/Choose template for your Socket/)
      .respond('\n')
      .code(0)
      .end(done)
  })

  it('can submit created socket to the registry', function (done) {
    testNixt()
      .run(`${cliLocation} submit ${createdSocketName}`)
      .stdout(/to make it available for everyone/)
      .code(0)
      .end(done)
  })

  it('can bump version of submited socket', function (done) {
    testNixt()
      .run(`${cliLocation} submit ${createdSocketName} -b minor`)
      .stdout(/\(0\.1\.0\)\.\.\. Done/)
      .code(0)
      .end(done)
  })

  it('can submit socket with wrong version to the registry', function (done) {
    testNixt()
      .before(() => {
        replace({
          regex: 'version: 0.1.0',
          replacement: 'version: 25.0.1',
          paths: [path.join(testsLocation, testInstance, 'syncano', createdSocketName)],
          recursive: true,
          silent: true
        })
      })
      .run(`${cliLocation} submit ${createdSocketName}`)
      .stdout(/is not comaptible with this Syncano environment/)
      .code(1)
      .end(done)
  })

  it('can publish created socket', function (done) {
    testNixt()
      .run(`${cliLocation} publish ${createdSocketName}`)
      .stdout(/now publicly available/)
      .code(0)
      .end(done)
  })

  it('can\'t publish socket again', function (done) {
    testNixt()
      .run(`${cliLocation} publish ${createdSocketName}`)
      .stdout(/This socket is not private/)
      .code(1)
      .end(done)
  })

  it('can search for existing socket', function (done) {
    testNixt()
      .run(`${cliLocation} search ${createdSocketName}`)
      .stdout(/socket\(s\) found/)
      .code(0)
      .end(done)
  })

  it('can add registry socket', function (done) {
    const testInstance = uniqueInstance()
    const testNixt = () => nixt()
      .env('SYNCANO_PROJECT_INSTANCE', testInstance)
      .env('SYNCANO_AUTH_KEY', process.env.E2E_CLI_ACCOUNT_KEY)
      .cwd(path.join(testsLocation, testInstance))

    testNixt()
      .before(async () => createProject(testInstance, projectTestTemplate))
      .after(async () => deleteInstance(testInstance))
      .env('DEBUG', '*')
      .run(`${cliLocation} add ${createdSocketName}`)
      .on(/Type in value:/)
      .respond(`${randomKey}\n`)
      .stdout(/socket synced:/)
      .code(0)
      .end(done)
  })
})
