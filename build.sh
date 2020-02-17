

yarn install
yarn backend
export SOURCECRED_GITHUB_TOKEN=YOUR_GITHUB_TOKEN
curl -s https://api.github.com/orgs/nf-core/repos | grep full_name | cut -d \" -f 4 | grep -vE 'configs|tools' | xargs node bin/sourcecred.js load
