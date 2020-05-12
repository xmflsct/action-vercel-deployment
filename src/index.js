const core = require("@actions/core")
const github = require("@actions/github")
const exec = require("@actions/exec")

const vercelToken = core.getInput("vercelToken")
const vercelOrgId = core.getInput("vercelOrgId")
const vercelProjectId = core.getInput("vercelProjectId")
const githubToken = core.getInput("githubToken")
const buildOption = core.getInput("buildOption") === "true"
const buildSource = core.getInput("buildSource")
const deploySource = core.getInput("deploySource")
const assignDomain = core.getInput("assignDomain")

let octokit = new github.GitHub(githubToken)

async function run() {
  core.info("--- start ---")
  core.debug(JSON.stringify(github.context))
  let ref
  let sha
  let message

  if (github.context.eventName === "push") {
    core.info("Retriving push metadata")
    ref = github.context.ref.replace("refs/heads/", "")
    sha = github.context.sha
    message = github.context.head_commit.message
  } else if (github.context.eventName === "pull_request") {
    core.info("Retriving pull request metadata")
    const pullRequestPayload = github.context.payload

    ref = pullRequestPayload.pull_request.head.ref
    sha = pullRequestPayload.pull_request.head.sha
    const { data: commitData } = await octokit.git.getCommit({
      ...github.context.repo,
      commit_sha: sha,
    })
    message = commitData.message
  }

  if (buildOption) {
    await buildStatic()
  }

  await setVercelEnv()

  const deploymentUrl = await vercelDeploy(ref, commit)

  if (assignDomain) {
    await setVercelEnv()
    await assignDomainToDeployment(deploymentUrl)
  }

  if (github.context.issue.number) {
    core.info("this is related issue or pull_request ")
    await createCommentOnPullRequest(sha, deploymentUrl)
  } else if (github.context.eventName === "push") {
    core.info("this is push event")
    await createCommentOnCommit(sha, deploymentUrl)
  }

  core.info("---- end ----")
}

async function buildStatic() {
  core.info("[Build starts]")
  let myOutput = ""
  let myError = ""
  const options = {}
  options.listeners = {
    stdout: (data) => {
      myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data) => {
      myError += data.toString()
      core.info(data.toString())
    },
  }
  options.cwd = "./" + buildSource
  core.info("Build source is at : " + options.cwd)

  await exec.exec("npx", ["yarn"], options)
  await exec.exec("npx", ["yarn", "build"], options)

  core.info("[Build ends]")
  return
}

async function setVercelEnv() {
  core.info("[Set env starts]")
  if (vercelOrgId) {
    core.exportVariable("VERCEL_ORG_ID", vercelOrgId)
  }
  if (vercelProjectId) {
    core.exportVariable("VERCEL_PROJECT_ID", vercelProjectId)
  }
  core.info("[Set env ends]")
}

async function vercelDeploy(ref, commit) {
  core.info("[Deploy starts]")
  let myOutput = ""
  let myError = ""
  const options = {}
  options.listeners = {
    stdout: (data) => {
      myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data) => {
      myError += data.toString()
      core.info(data.toString())
    },
  }
  options.cwd = "./" + deploySource
  core.info("Deployment directory is at : " + options.cwd)

  await exec.exec(
    "npx",
    [
      "vercel",
      "--token",
      vercelToken,
      "-m",
      "githubDeployment=1",
      "-m",
      `githubRepo=${github.context.payload.repository.full_name}`,
      "-m",
      `githubCommitRef=${ref}`,
      "-m",
      `githubCommitSha=${sha}`,
      "-m",
      `githubCommitMessage=${message}`,
      "-m",
      `githubCommitAuthorLogin=${github.context.payload.head_commit.author.username}`,
      "-m",
      `githubCommitAuthorName=${github.context.payload.head_commit.author.name}`,
    ],
    options
  )

  core.info("[Deploy ends]")
  return myOutput
}

async function assignDomainToDeployment(deploymentUrl) {
  core.info("[Assign domain starts]")
  let myOutput = ""
  let myError = ""
  const options = {}
  options.listeners = {
    stdout: (data) => {
      myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data) => {
      myError += data.toString()
      core.info(data.toString())
    },
  }

  try {
    await exec.exec(
      "npx",
      ["vercel", "alias", deploymentUrl, assignDomain],
      options
    )
  } catch (error) {
    core.warning("Assigning domain failed with error : " + error)
  }

  core.info("[Assign domain ends]")
  return
}

async function createCommentOnCommit(deploymentCommit, deploymentUrl) {
  const body = `<img align="center" width="35" height="35" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/vercel.svg">\r\n\r\n<img align="left" width="24" height="24" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/info.svg"> This commit ${deploymentCommit} is built and deployed to [Vercel](https://vercel.com/).\r\n\r\n<img align="left" width="24" height="24" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/check-in-circle.svg"> Preview: ${deploymentUrl}\r\n\r\n<img align="left" width="24" height="24" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/award.svg"> This commit has been automatically deployed with [vercel-deployment](https://github.com/xmflsct/action-vercel-deployment)`

  await octokit.repos.createCommitComment({
    ...github.context.repo,
    commit_sha: github.context.sha,
    body: body,
  })
}

async function createCommentOnPullRequest(deploymentCommit, deploymentUrl) {
  const body = `<img align="center" width="35" height="35" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/vercel.svg">\r\n\r\n<img align="left" width="24" height="24" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/info.svg"> This commit ${deploymentCommit} is built and deployed to [Vercel](https://vercel.com/).\r\n\r\n<img align="left" width="24" height="24" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/check-in-circle.svg"> Preview: ${deploymentUrl}\r\n\r\n<img align="left" width="24" height="24" src="https://raw.githubusercontent.com/xmflsct/action-vercel-deployment/master/src/svgs/award.svg"> This pull request has been automatically deployed with [vercel-deployment](https://github.com/xmflsct/action-vercel-deployment)`

  await octokit.issues.createComment({
    ...github.context.repo,
    issue_number: github.context.issue.number,
    body: body,
  })
}

run().catch((error) => {
  core.setFailed(error.message)
})
