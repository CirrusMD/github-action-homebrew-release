# github-action-homebrew-release
Automatically release to a homebrew repo

An example of this in action can be seen between: 

https://github.com/CirrusMD/aws-jumpcloud 

and 

https://github.com/CirrusMD/homebrew-aws-jumpcloud

Assumptions: 
* the source repository has a tagged release strategy
* we look up the most recent release and update your homebrew release with that information
* you're wanting to release to homebrew using a tar.gz file

## Inputs

### `gh-token`

**Required** The source repo's GITHUB_TOKEN.

### `homebrew-gh-token`

**Required** A token (PAT) to access the homebrew repo.

### `homebrew-repo`

**Required** The homebrew repo location. Ex: CirrusMD/homebrew-aws-jumpcloud

### `source-template-path`

**Required** The source, in the source repo, where the template for Homebrew can be found. Ex: HomebrewFormula/aws-jumpcloud.rb 

### `homebrew-repo-default-branch`

**Required** The default branch in your homebrew formula repo, default: 'main'

## Example usage
```
uses: CirrusMD/github-action-homebrew-release@v1.0.0
with:
  gh-token: ${{ secrets.GITHUB_TOKEN }}
  homebrew-gh-token: ${{ secrets.HOMEBREW_TOKEN }}
  homebrew-repo: CirrusMD/homebrew-aws-jumpcloud
  source-template-path: HomebrewFormula/aws-jumpcloud.rb
```