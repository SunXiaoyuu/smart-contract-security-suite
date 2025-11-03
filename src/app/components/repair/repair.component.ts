import { Component } from '@angular/core';

@Component({
  selector: 'app-repair',
  templateUrl: './repair.component.html',
})
export class RepairComponent {
  patchSuggestion = `
  修改第22行：加入 nonReentrant 修饰符；
  修改第45行：引入 SafeMath 库；
  `;
  repairedCode = '';

  applyPatch() {
    this.repairedCode = '✅ 已生成修复后的智能合约代码（模拟）';
  }
}
