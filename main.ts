import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import axios from 'axios';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
  repo: string;
  branch: string;
  path: string;
  token: string;
  subPathable: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  repo: '',
  branch: 'master',
  path: '/',
  token: '',
  subPathable: true,
}

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.workspace.on('editor-paste', (event, editor, content) => {
        this.uploadFiles(event.clipboardData?.files, event, editor);
      })
    );
    this.registerEvent(
      this.app.workspace.on('editor-drop', (event, editor, content) => {
        this.uploadFiles(event.dataTransfer?.files, event, editor);
      })
    );

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SampleSettingTab(this.app, this));
  }

  uploadFiles(files: FileList | undefined, event: ClipboardEvent | DragEvent, editor: Editor) {
    if (!files?.length) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.settings.subPathable) {
      new SampleModal(this.app, files, editor, this.settings).open();
    }
    else {
      uploadToGitee(files, this.settings).then((res) => {
        editor.replaceSelection(res.filter(x => x).join('\n'));
      })
    }
  }

  onunload() {

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function uploadToGitee(fileList: FileList, settings: MyPluginSettings, filePath: string = '') {
  const tooLargeFiles = Array.from(fileList).filter(file => file.size > 1024 * 1024 * 10);
  if (tooLargeFiles.length) {
    new Notice(`文件大小不能超过10MB，${tooLargeFiles.map(file => file.name).join('、')}将会被丢弃`, 5000);
  }
  return Promise.all(Array.from(fileList).filter(file => file.size <= 1024 * 1024 * 10).map(file => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        axios.post(`https://gitee.com/api/v5/repos/${settings.repo}/contents/${settings.path}/${filePath}/${file.name}`, {
          access_token: settings.token,
          content: (reader.result as string).replace(`data:${file.type};base64,`, ''),
          message: 'upload image'
        })
          .then(res => {
            resolve(file.type.includes('image') ? `![${file.name}](${res.data.content.download_url})` : res.data.content.download_url)
          })
          .catch(err => {
            new Notice(`上传文件${file.name}失败，失败原因：${err.response.data.message}`, 5000);
            resolve('')
          })
      };
      reader.onerror = err => {
        new Notice(`文件读取${file.name}失败`, 5000);
        resolve('')
      };
      reader.readAsDataURL(file);
    })
  }))
}

class SampleModal extends Modal {

  filePath: string;
  fileList: FileList;
  editor: Editor;
  settings: MyPluginSettings;

  constructor(app: App, fileList: FileList, editor: Editor, settings: MyPluginSettings) {
    super(app);
    this.filePath = localStorage.getItem('filePath') || '';
    this.fileList = fileList;
    this.editor = editor;
    this.settings = settings;
  }

  onOpen() {
    const { contentEl } = this;

    // 添加标题
    contentEl.createEl('h3', { text: '请输入文件路径' });

    // 创建文本输入框
    new Setting(contentEl)
      .setName('文件路径')
      .setDesc('可在设置中关闭此功能')
      .addText(text => text
        .setPlaceholder('请输入文件路径')
        .setValue(this.filePath)
        .onChange(value => {
          this.filePath = value;
          localStorage.setItem('filePath', value);
        }));

    // 创建提交按钮
    new Setting(contentEl).addButton(btn => {
      btn.setButtonText('上传');
      btn.onClick(async () => {
        uploadToGitee(this.fileList, this.settings, this.filePath).then((res) => {
          this.editor.replaceSelection(res.filter(x => x).join('\n'));
          this.close();
        })
      });
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('仓库名')
      .setDesc('格式: owner/repo')
      .addText(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.repo)
        .onChange(async (value) => {
          this.plugin.settings.repo = value;
          await this.plugin.saveSettings();
        })
      )

    new Setting(containerEl)
      .setName('分支名')
      .setDesc('默认: master')
      .addText(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.branch)
        .onChange(async (value) => {
          this.plugin.settings.branch = value;
          await this.plugin.saveSettings();
        })
      )

    new Setting(containerEl)
      .setName('存储路径')
      .setDesc('默认: /')
      .addText(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.path)
        .onChange(async (value) => {
          this.plugin.settings.path = value;
          await this.plugin.saveSettings();
        })
      )

    new Setting(containerEl)
      .setName('私人令牌')
      .setDesc('获取方式：头像 -> 设置 -> 私人令牌')
      .addText(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.token)
        .onChange(async (value) => {
          this.plugin.settings.token = value;
          await this.plugin.saveSettings();
        })
      )

    new Setting(containerEl)
      .setName('文件路径')
      .setDesc('粘贴文件时是否需要输入文件路径，文件路径始终为存储路径下的子路径')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.subPathable)
        .onChange(async (value) => {
          this.plugin.settings.subPathable = value;
          await this.plugin.saveSettings();
        })
      )
  }
}
