require "language/node"

class Oceancode < Formula
  desc "Next-generation CLI coding assistant"
  homepage "https://github.com/oceancodecli/oceancode"
  url "https://registry.npmjs.org/oceancode/-/oceancode-0.1.2.tgz"
  sha256 "11fee68bfb11fdff035d19a6dc0a345cad12649063de189bb649bde6d6a92424"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/oceancode --version")
  end
end
