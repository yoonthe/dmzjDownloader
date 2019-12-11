#!/usr/bin/env node

const inquirer = require('inquirer');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const urllib = require('urllib');
const fsp = fs.promises;

const getData = ul => Array.from(ul.children).map(li => li.children[0]).map(a => [a.title, a.href]);
const getOptions = select => Array.from(select.children).map(option => [option.innerText, option.value]);

const savePic = dir => async ([name, url]) => {
  const ext = /.[^.\/]+$/.exec(url);
  const ws = fs.createWriteStream(path.join(dir, `${name}${ext !== null ? ext[0] : '.jpg'}`));
  const p = () => new Promise((resolve, reject) => {
    try {
      urllib.request(url, {
        writeStream: ws,
      }, err => {
        if (err) {
          console.error(err);
          return resolve(p());
        }
        resolve();
      })
    } catch (err) {
      console.error(err);
      resolve(p());
    }
  });
  await p();
  console.log(`${name} (${url}) 保存成功！`);
};

const run = async (url, dir) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const mainList = await page.$$('.cartoon_online_border>ul');
  const otherList = await page.$$('.cartoon_online_border_other>ul');
  if (mainList.length === 0) {
    throw new Error('当前漫画已无法下载，请重试！');
  }
  const list = await getList(mainList, otherList);
  for (const handle of list) {
    const data = await page.evaluateHandle(getData, handle);
    for (const [subname, suburl] of await data.jsonValue()) {
      console.log(`开始保存 ${subname} (${suburl}) 到 ${dir}`);
      const subdir = path.join(dir, subname);
      const save = savePic(subdir);
      if (!fs.existsSync(subdir)) {
        await fsp.mkdir(subdir);
      }
      const tempPage = await browser.newPage();
      await tempPage.goto(suburl);
      const select = await tempPage.$('#page_select');
      const options = await tempPage.evaluateHandle(getOptions, select);
      for (const img of await options.jsonValue()) {
        await save(img);
      }
      console.log(`${subname} (${suburl}) 保存完毕！`);
    }
  }
  await browser.close();
};

const getList = async (mainList, otherList) => {
  if (otherList.length > 0) {
    const { downloadExtra } = await inquirer.prompt([
      {
        type: 'list',
        message: '当前漫画包含额外内容（可能与主要内容重复），是否需要下载额外内容',
        name: 'downloadExtra',
        choices: [
          {
            name: '是',
            value: 1,
          },
          {
            name: '否',
            value: 0,
          }
        ],
        default: () => 1,
      }
    ]);
    if (downloadExtra === 1) {
      return [].concat(mainList, otherList);
    }
  }
  return mainList;
}

const questions = [
  {
    type: 'input',
    name: 'url',
    message: '请输入漫画在dmzj的主页地址（形如 https://manhua.dmzj.com/yiquanchaoren ）',
    validate: value => /(https:)?\/\/manhua.dmzj.com\/[^\/]+\/?/.test(value) ? true : '漫画地址必定以 https://manhua.dmzj.com/ 开头并且只有一级/！',
  },
  {
    type: 'input',
    name: 'dir',
    message: `请输入漫画要保存的路径`,
    default: () => process.cwd(),
    validate: value => fs.existsSync(value) ? true : '保存路径不存在，请检查后重试！',
  }
];

const main = async () => {
  const { url, dir } = await inquirer.prompt(questions);
  await run(url, dir);
};

main();
