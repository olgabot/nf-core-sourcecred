// @flow

import tmp from "tmp";
import path from "path";
import fs from "fs-extra";
import stringify from "json-stable-stringify";
import {NodeAddress} from "../../core/graph";
import {MappedReferenceDetector} from "../../core/references";
import {type Initiative, createId, addressFromId} from "./initiative";
import {
  type InitiativeFile,
  type InitiativesDirectory,
  fromJSON,
  toJSON,
  initiativeFileURL,
  loadDirectory,
  _initiativeFileId,
  _validatePath,
  _findFiles,
  _readFiles,
  _validateUrl,
  _convertToInitiatives,
  _createReferenceMap,
} from "./initiativesDirectory";

const exampleInitiativeFile = (): InitiativeFile => ({
  title: "Sample initiative",
  timestampIso: ("2020-01-08T22:01:57.766Z": any),
  completed: false,
  champions: ["http://foo.bar/champ"],
  contributions: ["http://foo.bar/contrib"],
  dependencies: ["http://foo.bar/dep"],
  references: ["http://foo.bar/ref"],
});

const exampleInitiative = (remoteUrl: string, fileName: string): Initiative => {
  const {timestampIso, ...partialInitiativeFile} = exampleInitiativeFile();
  return {
    ...partialInitiativeFile,
    id: createId("INITIATIVE_FILE", remoteUrl, fileName),
    timestampMs: Date.parse((timestampIso: any)),
  };
};

describe("plugins/initiatives/initiativesDirectory", () => {
  describe("toJSON/fromJSON", () => {
    it("should handle an example round-trip", () => {
      // Given
      const initiativeFile = exampleInitiativeFile();

      // When
      const actual = fromJSON(toJSON(initiativeFile));

      // Then
      expect(actual).toEqual(initiativeFile);
    });
  });

  describe("initiativeFileURL", () => {
    it("should return null for a different prefix", () => {
      // Given
      const address = NodeAddress.fromParts(["foobar"]);

      // When
      const url = initiativeFileURL(address);

      // Then
      expect(url).toEqual(null);
    });

    it("should detect the correct prefix and create a URL", () => {
      // Given
      const remoteUrl = "http://foo.bar/dir";
      const fileName = "sample.json";
      const address = addressFromId(
        createId("INITIATIVE_FILE", remoteUrl, fileName)
      );

      // When
      const url = initiativeFileURL(address);

      // Then
      expect(url).toEqual(`${remoteUrl}/${fileName}`);
    });
  });

  describe("_initiativeFileId", () => {
    it("should add the correct prefix to a remoteUrl and fileName", () => {
      // Given
      const dir: InitiativesDirectory = {
        localPath: "should-not-be-used",
        remoteUrl: "http://foo.bar/dir",
      };
      const fileName = "sample.json";

      // When
      const id = _initiativeFileId(dir, fileName);

      // Then
      expect(id).toEqual(createId("INITIATIVE_FILE", dir.remoteUrl, fileName));
    });
  });

  describe("_validatePath", () => {
    it("should resolve relative paths", async () => {
      // Given
      const localPath = `${__dirname}/./test/../example/`;

      // When
      const actual = await _validatePath(localPath);

      // Then
      expect(actual).toEqual(path.join(__dirname, "example"));
    });

    it("should throw when directory doesn't exist", async () => {
      // Given
      const localPath = path.join(tmp.dirSync().name, "findFiles_test");

      // When
      const p = _validatePath(localPath);

      // Then
      await expect(p).rejects.toThrow(
        `Provided initiatives directory does not exist at: ${localPath}`
      );
    });

    it("should throw when directory is not a directory", async () => {
      // Given
      const localPath = path.join(tmp.dirSync().name, "findFiles_test");
      await fs.writeFile(localPath, "");

      // When
      const p = _validatePath(localPath);

      // Then
      await expect(p).rejects.toThrow(
        `Provided initiatives directory is not a directory at: ${localPath}`
      );
    });
  });

  describe("_findFiles", () => {
    it("should locate all *.json files in a local path", async () => {
      // Given
      const localPath = path.join(__dirname, "example");

      // When
      const fileNames = await _findFiles(localPath);

      // Then
      // Shallow copy to sort, because the array is read-only.
      const actualNames = [...fileNames].sort();
      expect(actualNames).toEqual(["initiative-A.json", "initiative-B.json"]);
    });
  });

  describe("_readFiles", () => {
    it("should read provided initiativeFiles, sorted by name", async () => {
      // Given
      const localPath = path.join(__dirname, "example");
      const fileNames = ["initiative-B.json", "initiative-A.json"];

      // When
      const map = await _readFiles(localPath, fileNames);

      // Then
      expect([...map.keys()]).toEqual([
        "initiative-A.json",
        "initiative-B.json",
      ]);
      expect(map).toMatchSnapshot();
    });

    it("should throw when directory doesn't exist", async () => {
      // Given
      const localPath = path.join(tmp.dirSync().name, "findFiles_test");
      const fileNames = ["initiative-B.json", "initiative-A.json"];

      // When
      const p = _readFiles(localPath, fileNames);

      // Then
      await expect(p).rejects.toThrow("Could not find Initiative file at:");
    });

    it("should throw when directory is not a directory", async () => {
      // Given
      const localPath = path.join(tmp.dirSync().name, "findFiles_test");
      const fileNames = ["initiative-B.json", "initiative-A.json"];
      await fs.writeFile(localPath, "");

      // When
      const p = _readFiles(localPath, fileNames);

      // Then
      await expect(p).rejects.toThrow("Could not find Initiative file at:");
    });
  });

  describe("_validateUrl", () => {
    it("should remove trailing slashes from URLs", () => {
      // Given
      const remoteUrl = "http://example.com/initiatives///";

      // When
      const actual = _validateUrl(remoteUrl);

      // Then
      expect(actual).toEqual("http://example.com/initiatives");
    });

    it("should throw on invalid URL", () => {
      // Given
      const remoteUrl = ";;;";

      // When
      const fn = () => _validateUrl(remoteUrl);

      // Then
      expect(fn).toThrow(
        `Provided initiatives directory URL was invalid: ${remoteUrl}\n` +
          `TypeError: Invalid URL`
      );
    });

    it("should throw when given a search", () => {
      // Given
      const remoteUrl = "http://example.com/initiatives?test";

      // When
      const fn = () => _validateUrl(remoteUrl);

      // Then
      expect(fn).toThrow(
        `Provided initiatives directory URL was invalid: ${remoteUrl}\n` +
          `URL should not have a search component: ?test`
      );
    });

    it("should throw when given a hash", () => {
      // Given
      const remoteUrl = "http://example.com/initiatives#test";

      // When
      const fn = () => _validateUrl(remoteUrl);

      // Then
      expect(fn).toThrow(
        `Provided initiatives directory URL was invalid: ${remoteUrl}\n` +
          `URL should not have a hash component: #test`
      );
    });
  });

  describe("_convertToInitiatives", () => {
    it("should correctly convert initiativeFile from a map", async () => {
      // Given
      const dir: InitiativesDirectory = {
        localPath: "should-not-be-used",
        remoteUrl: "http://example.com/initiatives",
      };
      const map = new Map([["initiative-A.json", exampleInitiativeFile()]]);

      // When
      const initiatives = await _convertToInitiatives(dir, map);

      // Then
      expect(initiatives).toEqual([
        exampleInitiative(dir.remoteUrl, "initiative-A.json"),
      ]);
    });
  });

  describe("_createReferenceMap", () => {
    it("should correctly map initiatives as <URL, NodeAddressT> pairs", () => {
      // Given
      const fileName = "initiative-A.json";
      const remoteUrl = "http://example.com/initiatives";
      const initiatives = [exampleInitiative(remoteUrl, fileName)];

      // When
      const map = _createReferenceMap(initiatives);

      // Then
      expect(map).toBeInstanceOf(Map);
      expect([...map.entries()]).toEqual([
        [
          "http://example.com/initiatives/initiative-A.json",
          addressFromId(createId("INITIATIVE_FILE", remoteUrl, fileName)),
        ],
      ]);
    });

    it("should throw when given an Initiative not created from an InitiativeFile", () => {
      // Given
      const fileName = "initiative-A.json";
      const remoteUrl = "http://example.com/initiatives";
      const initiative = {
        ...exampleInitiative(remoteUrl, fileName),
        id: createId("TEST", "not-from-file"),
      };

      // When
      const fn = () => _createReferenceMap([initiative]);

      // Then
      expect(fn).toThrow("BUG: Initiative doesn't return an initiativeFileURL");
    });
  });

  describe("loadDirectory", () => {
    it("should handle an example smoke test", async () => {
      // Given
      const dir: InitiativesDirectory = {
        localPath: path.join(__dirname, "example"),
        remoteUrl: "http://example.com/initiatives",
      };

      // When
      const {initiatives: repo, referenceDetector} = await loadDirectory(dir);
      const initiatives = repo.initiatives();

      // Then
      expect(referenceDetector).toBeInstanceOf(MappedReferenceDetector);
      const referenceEntries = [...(referenceDetector: any).map.entries()];
      expect(stringify(referenceEntries, {space: 2})).toMatchSnapshot();
      expect(stringify(initiatives, {space: 2})).toMatchSnapshot();
    });

    it("should perform localPath testing", async () => {
      // Given
      const dir: InitiativesDirectory = {
        // Local path doesn't exist.
        localPath: path.join(tmp.dirSync().name, "findFiles_test"),
        remoteUrl: "http://example.com/initiatives",
      };

      // When
      const p = loadDirectory(dir);

      // Then
      await expect(p).rejects.toThrow(
        `Provided initiatives directory does not exist`
      );
    });

    it("should perform remoteUrl testing", async () => {
      // Given
      const dir: InitiativesDirectory = {
        localPath: path.join(__dirname, "example"),
        // URL is invalid
        remoteUrl: "http://example.com/initiatives#invalid-hash",
      };

      // When
      const p = loadDirectory(dir);

      // Then
      await expect(p).rejects.toThrow(
        `Provided initiatives directory URL was invalid`
      );
    });

    it("should use validated URL to create mappings and addresses", async () => {
      // Given
      const dir: InitiativesDirectory = {
        localPath: path.join(__dirname, "example"),
        // URL has trailing slashes we need to remove.
        remoteUrl: "http://example.com/initiatives///",
      };

      // When
      const {initiatives: repo, referenceDetector} = await loadDirectory(dir);
      const initiatives = repo.initiatives();

      // Then
      const urls = [...(referenceDetector: any).map.keys()];
      expect(urls).toEqual([
        "http://example.com/initiatives/initiative-A.json",
        "http://example.com/initiatives/initiative-B.json",
      ]);
      expect(initiatives.map((i) => i.id)).toEqual([
        [
          "INITIATIVE_FILE",
          "http://example.com/initiatives",
          "initiative-A.json",
        ],
        [
          "INITIATIVE_FILE",
          "http://example.com/initiatives",
          "initiative-B.json",
        ],
      ]);
    });
  });
});
