const axios = require('axios')
const core = require('@actions/core')
const fs = require("fs")
const git = require("nodegit");
const graphql = require('@octokit/graphql')
const handlebars = require('handlebars')
const hasha = require('hasha')
const path = require('path')
const process = require('process')
const tmp = require('tmp')
const { writeFile, readFile } = require('fs-extra')


async function query_release(current_gh_token, repo_owner, repo_name){
    const releaseList = await graphql.graphql({
            query: `query releaseList($repoOwner: String!, $repoName: String!){
    repository(name:$repoName, owner:$repoOwner){
    latestRelease{
      releaseAssets(first: 10){
        nodes{
          id,
          name,
          downloadUrl
      }   
    }
  }}
}`,
            repoOwner: repo_owner,
            repoName: repo_name,
            headers: {
                authorization: `token ${current_gh_token}`
            }
        }
    )
    const finalList = releaseList["repository"]["latestRelease"]['releaseAssets']['nodes'].filter(function (item) {
        return item["downloadUrl"].match(/.+\.tar\.gz/)
    })
    return finalList[0]
}

async function download_and_hash(url, destination){
    const writer = fs.createWriteStream(destination)
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    })
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
    })
}

async function auth_git(gh_repo, gh_token){
    const clone_options = {
        fetchOpts: {
            callbacks: {
                certificateCheck: () => {
                    return 1;
                },
                credentials: () => {
                    return git.Cred.userpassPlaintextNew(gh_token, 'x-oauth-basic');
                }
            }
        }
    }
    const clone_url = `https://${gh_token}:x-oauth-basic@github.com/${gh_repo}.git`

    return  {
        clone_options: clone_options,
        clone_url: clone_url
    }
}
async function clone_git(gh_repo, gh_token){
    const repo_with_auth = await auth_git(gh_repo, gh_token)
    const gh_repo_dir = tmp.dirSync();
    console.log(`GH repo dir for ${gh_repo} is ${gh_repo_dir.name}`)
    const cloned_repository = git.Clone(repo_with_auth.clone_url, gh_repo_dir.name, repo_with_auth.clone_options)
    return cloned_repository
}

async function write_template(source_template_path, current_repo_path, homebrew_repo_path,version,sha256,tarball_url){
    const template_string = (await readFile(`${current_repo_path}/${source_template_path}`)).toString()
    const input_template = handlebars.compile(template_string)
    const output_template = input_template({
        version,
        tarball_url,
        sha256,
    })
    const template_destination = `${homebrew_repo_path}/${path.basename(source_template_path)}`
    await writeFile(template_destination, output_template)

}

async function commit_git(repo, homebrew_default_branch, homebrew_version) {
    const default_branch = `refs/heads/${homebrew_default_branch}:refs/heads/${homebrew_default_branch}`
    const signature = await git.Signature.now("action-homebrew-release", "action-homebrew-release@nowhere.local");
    await repo.refreshIndex().then(function (index) {
        return index.addAll("*")
            .then(function () {
                return index.write()
            })
            .then(function () {
                return index.writeTree()
                /* eslint-disable */
            }).then(function (oidResult) {
                oid = oidResult;
                /* eslint-enable */
                return git.Reference.nameToId(repo, "HEAD");
            }).then(function (head) {
                return repo.getCommit(head);
            })
    }).then(function (parent) {
        /* eslint-disable */
        return repo.createCommit("HEAD", signature, signature, `action-homebrew-release, version: ${homebrew_version}`, oid, [parent]);
        /* eslint-enable*/
    })

    const remote = await repo.getRemote('origin')
    await remote.push([default_branch])
}

// main
async function main () {
    const current_gh_repo = process.env.GITHUB_REPOSITORY
    const current_repo_owner = current_gh_repo.split('/')[0]
    const current_repo_name = current_gh_repo.split('/')[1]
    const current_repo_sha = process.env.GITHUB_REF
    const current_gh_token = core.getInput('gh-token') || process.env.GH_TOKEN
    const source_template_path = core.getInput('source-template-path') || process.env.SOURCE_TEMPLATE_PATH
    const homebrew_gh_token = core.getInput('homebrew-gh-token') || process.env.HOMEBREW_GH_TOKEN
    const homebrew_repo = core.getInput('homebrew-repo') || process.env.HOMEBREW_REPO
    const homebrew_repo_default_branch = core.getInput('homebrew-repo-default-branch') || process.env.HOMEBREW_REPO_DEFAULT_BRANCH
    const download_destination = tmp.fileSync().name

    try {
        const release_data = await query_release(current_gh_token, current_repo_owner, current_repo_name)
        console.log(`using release data: ${JSON.stringify(release_data)}`)
        const local_homebrew_repo = await clone_git(homebrew_repo,homebrew_gh_token)
        const local_current_repo = await clone_git(current_gh_repo,current_gh_token)
        await git.Reference.lookup(local_current_repo, current_repo_sha).then(function (reference){
            local_current_repo.checkoutRef(reference)
        })
        console.log(`local homebrew repo: ${local_homebrew_repo.workdir()}`)
        console.log(`local current repo: ${local_current_repo.workdir()}`)
        await download_and_hash(release_data.downloadUrl,download_destination)
        const hash = await hasha.fromFileSync(download_destination,{encoding: 'hex', algorithm: 'sha256'})
        console.log(`sha is: ${hash}`)
        const homebrew_version = current_repo_sha.split('/')[2]
        await write_template(source_template_path,local_current_repo.workdir(),local_homebrew_repo.workdir(),homebrew_version,hash,release_data.downloadUrl)
        await commit_git(local_homebrew_repo, homebrew_repo_default_branch, homebrew_version)

    } catch (e) {
        console.log(`github-action-homebrew-release failed for reason: ${e}`)
        core.setFailed(`github-action-homebrew-release failed for reason: ${e}`)
    }

}

main()