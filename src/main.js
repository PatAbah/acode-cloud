import plugin from '../plugin.json';
import css from './acodecloud.css';
import copy from 'copy-to-clipboard';

let sidebarApps = acode.require("sidebarApps");
let prompt = acode.require("prompt");
let fs = acode.require('fs');
let confirm = acode.require("confirm");
let toast = acode.require("toast");
let loader = acode.require("loader");
const fileBrowser = acode.require('fileBrowser');
 
const { commands } = editorManager.editor
const { version, versionCode } = BuildInfo;
const user_agent = `Acode ${version} (${versionCode})`;  
const common_header = { 'Content-Type': 'application/json','Acode': user_agent,'Authorization': `Bearer ${window.localStorage.getItem('acodecloud_token')}`, };
const endpoint_base = CLOUD_ENDPOINT_HERE;
const acodecloud_token_exists = window.localStorage.getItem("acodecloud_token");

class AcodeCloud {
    
    async init() {
        acode.addIcon('cloud', this.baseUrl+'sideicon.svg') //'https://s31-hzfi.freeconvert.com/task/65afae7cbbafc743ba7cc413/1706008224132.svg');
        this.$style = tag("style", {
            textContent: css,
        });
        document.head.append(this.$style) 

        sidebarApps.add("cloud", plugin.id, plugin.name, (container) => {
            this.node = tag("div", {
                id: "AcodeCloud", 
                className: "", 
            });
            this.fileNode = tag("div", {
                id: "files-list",
                children: [],
            });
            
            this.node.append(
                tag("div", {
                  className: "cloudhead",
                  children: [
                    tag("h3", {
                      className: "spaces-title",
                      textContent: `${plugin.aka}`,
                    }),
                    true // acodecloud_token_exists
                      ? tag("span", {
                          className: "refresh-acodecloud",
                          children: [
                            tag("span", {
                              className: "reload-symbol",
                              textContent: "\u21BB", // Unicode character for refresh symbol
                              onclick: () => {
                                if (window.localStorage.getItem("acodecloud_token")) this.populate(); 
                              },
                            }),
                          ],
                        })
                      : "",
                  ],
                }), 
                acodecloud_token_exists ? tag("div", {
                  className: "cloudnote", 
                  id: "cloudnote", 
                }) : '', 
                tag("div", {
                  className: "addfile", 
                  id: "addfile", 
                  textContent: '+ | Upload file', 
                  onclick: (upload) => {
                      this.upload_file(upload);
                  }
                }), 
                tag("div", {
                  className: "cloudbody",
                  id: "cloudbody", 
                  children: [
                    this.fileNode,
                    tag("div", {
                        className: "", 
                    }), 
                  ],
                }), 
            );
            this.acodecloud_loading = tag("div", {
                id: "acodecloud_loading", 
                className: "no-files",
            }),
            this.node.insertBefore(this.acodecloud_loading, this.node.childNodes[3]);
            if (!acodecloud_token_exists){
                this.node.insertBefore(
                    tag("div", {
                      className: "not-connected", 
                      id: "not_connected", 
                      innerHTML: "Welcome to Acode Cloud. <p class='about'>This plug-in helps you backup selected files securely to the cloud.</p>",
                      children: [
                          tag("div", {
                              className: 'connect-button', 
                              textContent: 'Get Started', 
                              onclick: (start)=>{
                                  this.update_acodecloud_token();
                              },
                          })
                      ]
                    }), 
                    this.node.childNodes[3]
                );
            }
            container.append(this.node);
            this.populate();
        });
        
        // commands 
        commands.addCommand({
          name: `${plugin.aka}_API_Token`,
          description: `${plugin.aka} API Token`,
          bindKey: { win: 'Ctrl-Shift-B', mac: 'Command-Alt-B' },
          exec: this.update_acodecloud_token.bind(this),
        }); 
    }
    
    async populate(){
        
        const acodecloud_token = window.localStorage.getItem("acodecloud_token");

        if (acodecloud_token){
            try {
                const intro = window.document.getElementById('not_connected');
                intro && intro.parentNode.removeChild(intro);
                this.fileNode.innerHTML = '';
            } catch (error) {} 
            
            this.acodecloud_loading.innerHTML = 'Loading...';
            
            try {
                
                this.fileDataArray = await this.postaMan('/fetch', acodecloud_token); 
                this.fileDataArray.length ? '' : this.fileNode.append(tag("div", {
                  className: "no-files", 
                  textContent: "No files uploaded yet.",
                }));
                
                // Loop through the file data array and populate the fileNode
                this.fileDataArray.forEach((fileData) => {
                    
                    let batch_id = "file_"+fileData.file_name.replace(/[^A-Za-z0-9]/g, '_');
                    let batchElement = tag("details", {
                        className: "batch",
                        id: batch_id, 
                    });
                    batchElement.append(
                        tag("summary", {
                            textContent: fileData.file_name.length > 25 ? "..." + fileData.file_name.slice(-25) : fileData.file_name, 
                            id: "fileNameSpan", 
                        }), 
                        tag("div", {
                            className: "action",
                            id: "buttonContainer", 
                            children: [
                                tag("button", {
                                    textContent: "Copy",
                                    className: "copy", 
                                    onclick: (copy) => {
                                        this.do_action('copy', fileData.file_name, copy);
                                    }, 
                                }), 
                                tag("button", {
                                    className: "delete", 
                                    textContent: "Delete",
                                    onclick: (del) => {
                                        this.do_action('delete', fileData.file_name, del);
                                    }, 
                                })
                            ]
                        })
                    ); 
                    
                    this.fileNode.append(batchElement);

                });
                this.acodecloud_loading.innerHTML = "";
            } catch (error) {
                this.acodecloud_loading.innerHTML = 'Could not load files: ' +error.message;
            }
        } 
        else {
            // uncommenting the line below will automatically prompt users for the token immediately after install. This may not be the best approach. 
            //this.update_acodecloud_token(); 
        }
    }
    
    async do_action(action, file_name, event){
        
        if (action == "delete"){
            let file_name_to_delete = file_name.split('/').pop();
            let confirm_delete= await confirm('Delete file', `Proceed to permanently delete '${file_name_to_delete}' from Acode Cloud? This action cannot be undone.`);
            if (!confirm_delete){
                return 0;
            } 
        }
        
        let saved_innerText = event.target.innerText; 
        event.target.innerText = 'Processing...';
        
        try {
            const response = await fetch(endpoint_base+'/action', {
                method: 'POST',
                headers: common_header,
                body: JSON.stringify({
                    action: action, 
                    file_name: file_name, 
                }),
            });
    
            if (!response.ok) {
                event.target.innerText = saved_innerText;
                this.show_simple_alert("Failed to "+action, "Error: "+response.status); 
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
    
            const jsonData = await response.json();
            
            if (jsonData.status== 'success') {
                event.target.innerText = saved_innerText;
                if (action == 'delete'){
                    let elementToRemove = document.getElementById("file_"+jsonData.file_name.replace(/[^A-Za-z0-9]/g, '_'));
                    if (elementToRemove) {
                        elementToRemove.parentNode.removeChild(elementToRemove);
                        window.toast("File deleted", 4000);
                    } 
                }
                
                if (action == 'copy'){
                    // idk, but sometimes clicking once does not copy
                    copy(jsonData.content);
                    copy(jsonData.content);
                    window.toast('Copied to clipboard', 4000);
                }
            }
            
        } catch (error) {
            window.toast(error.message, 4000);
        }
    }
    
    async postaMan(todo) {
        
        if (todo == '/fetch'){
            const url = `${endpoint_base}/fetch`;
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: common_header,
                    body: JSON.stringify({}),
                });
        
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
        
                const jsonData = await response.json();
                return jsonData;
                
            } catch (error) {
                window.toast(error.message, 4000);
            }
        }
        
        if (todo == '/generate_key'){
            const url = `${endpoint_base}/generate_key`;
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: common_header,
                    body: JSON.stringify({}),
                });
        
                if (!response.ok) {
                    throw new Error(`Failed to generate new ${plugin.aka} Token: ${response.status}`);
                }
        
                const jsonData = await response.json();
                return jsonData;
                
            } catch (error) {
                let confirmation = await confirm(error.message, 'Click \'OK\' to try again.');
                if (confirmation) {
                    this.update_acodecloud_token(); // true
                }
            } 
        }
        
    }

    async upload_file(event) {
        
        if (!window.localStorage.getItem("acodecloud_token"))  {
            this.show_simple_alert("Hold on...", "You'll have to set up your "+plugin.aka+" first. Click the 'Get Started' button to begin, or Ctrl-Shift-b");
            return;
        }
        
        let saved_innerText = event.target.innerText;
        
        try {
            // Open file browser to let the user select a file
            const selectedFile = await fileBrowser('file', 'Select a file', true);
            const content = await fs(selectedFile.url).readFile("utf-8");
            let file_name = selectedFile.url;
            event.target.innerText = 'Uploading file...';
            
            const response = await fetch(endpoint_base+'/upload', {
                method: 'POST',
                headers: common_header,
                body: JSON.stringify({
                    file_name: file_name, 
                    content: content, 
                }),
            });
    
            if (!response.ok) {
                event.target.innerText = saved_innerText;
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
    
            const jsonData = await response.json();
            
            if (jsonData.status == 'success') {
                window.toast(file_name.split('/').pop() + ' uploaded successfully', 4000);
                event.target.innerText = 'Refreshing files...';
                this.populate();
                event.target.innerText = saved_innerText;
            }
            else {
                throw new Error(jsonData.message);
            }
        } catch (error) {
            event.target.innerText = saved_innerText;
            this.show_simple_alert('Error uploading file', error);
        }
    }

    async update_acodecloud_token(skip_confirmation=false) {
        /* Passing 'true' to this function skips the confirm dialog 
           and goes straight to generating the Token. 
        
        let confirmation = skip_confirmation;
        if (confirmation==false){
            confirmation = await confirm(plugin.aka+' API Token', 'Proceed to create a new token? Click \'CANCEL\' if you already have a token.');
        } else {
            confirmation = skip_confirmation;
        }
        */
        let confirmation = await confirm(plugin.aka+' API Token', 'Proceed to create a new token? Click \'CANCEL\' if you already have a token.');
        if (confirmation) {
            try {
                loader.create('Hold on...', `Generating a new ${plugin.aka} Token...`);
                let new_token_status = await this.postaMan('/generate_key');
                
                if (new_token_status.status == 'success'){
                    const token = new_token_status.key;
                    window.localStorage.setItem("acodecloud_token", token);
                    loader.destroy();
                    window.toast("Successful");
                    const DialogBox = acode.require('dialogBox');
                    const copy_token_dialog = DialogBox(
                      'Acode Cloud Token Generated',
                      `<b>WARNING!</b> 
                        <br><br>
                        <p>Write down/Copy and keep this token safe. You won't be shown this token again.</p>
                        <p><input class="token-box" style="width:100%" value="${token}" /></p>`,
                      'Done', 
                      'Cancel'
                    ); 
                    // <p><input class="token-box" style="width:85%" value="${token}" /></p><span class="refresh-acodecloud" style="margin: 2%" onclick="copy('${token}');window.toast('Token copied to clipboard', 3000)">Copy</span>;`,
                    copy_token_dialog.wait(10000); 
                    this.populate();
                    
                } else {
                    window.toast("Failed to generate new token");
                    loader.destroy();
                }
                
            } 
            catch (error) {
                loader.destroy();
                this.show_simple_alert('Error generating token', error.message);
            }
                
        } else {
            
            const options = {
                placeholder: `Enter your ${plugin.aka} Token`,
            };
            const user_token = await prompt(`Enter your ${plugin.aka} Token`, '', 'token', options);
            
            // confirm token 
            try {
                const response = await fetch(endpoint_base+'/generate_key', {
                    method: 'POST',
                    headers: common_header,
                    body: JSON.stringify({
                        existing_token: user_token, 
                    }),
                });
                if (!response.ok) {
                    //throw new Error(`ERROR: ${response.status}`);
                } 
                
                let jsonData = await response.json();
                if (jsonData.status == 'success'){
                    common_header.Authorization = user_token;
                    window.localStorage.setItem("acodecloud_token", jsonData.key);
                    this.populate();
                }
                else {
                    this.show_simple_alert("Invalid token", `The ${plugin.aka} Token you provided is invalid. Please check and retry, or generate a new token if you don't have one.`);
                }
            } 
            catch (error){
                this.show_simple_alert("Error validating token", error);
            }
        }
    }
    
    async show_simple_alert(title, message){
        let alert = acode.require('alert');
        alert(title, message);
    }
    
    async destroy() {
        sidebarApps.remove(plugin.id);
        this.$style.remove();
        window.localStorage.removeItem('acodecloud_token');
        commands.removeCommand("AcodeCloud_API_Token");
    }
}

if (window.acode) {
    const acodeCloud = new AcodeCloud();
    acode.setPluginInit(plugin.id, async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    acodeCloud.baseUrl = baseUrl;
    await acodeCloud.init($page, cacheFile, cacheFileUrl);
  });
  acode.setPluginUnmount(plugin.id, () => {
      acodeCloud.destroy();
  });
}
